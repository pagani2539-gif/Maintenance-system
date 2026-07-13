const { query, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const { validateStationExists } = require('../utils/stationValidation');

// สภาพอุปกรณ์ (manual) ที่ตั้งได้เองต่อ (สถานี × ชนิดอุปกรณ์)
const VALID_ASSET_STATUSES = ['ปกติ', 'ชำรุด', 'ชำรุดรอเปลี่ยน', 'ปลดระวาง'];

exports.getUniqueStations = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM stations`;
    const params = [];
    if (status !== undefined) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY name ASC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get Unique Stations Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getStationDetails = async (req, res) => {
  try {
    const { location, station_id } = req.query;

    let station = null;
    if (station_id) {
      const { rows } = await query('SELECT * FROM stations WHERE id = $1', [station_id]);
      station = rows[0] || null;
    } else if (location && location.trim() !== '') {
      const { rows } = await query('SELECT * FROM stations WHERE name = $1', [location.trim()]);
      station = rows[0] || null;
    }

    if (!station) {
      // Fallback if no station is found (e.g. legacy name search)
      station = { name: location || 'ไม่ระบุ', code: 'N/A', province: 'N/A', region: 'N/A', id: null };
    }

    const [
      repairsResult,
      claimsResult,
      withdrawalsResult,
      transactionsResult,
      statsResult
    ] = await Promise.all([
      // 1. Repairs at this station
      query(`
        SELECT *
        FROM repairs_view
        WHERE (station_id = $1 OR (station_id IS NULL AND location_snapshot = $2)) AND type = 'repair'
        ORDER BY created_at DESC, id DESC
      `, [station.id, station.name]),

      // 2. Claims at this station
      query(`
        SELECT *
        FROM repairs_view
        WHERE (station_id = $1 OR (station_id IS NULL AND location_snapshot = $2)) AND type = 'claim'
        ORDER BY created_at DESC, id DESC
      `, [station.id, station.name]),

      // 3. Withdrawals at this station
      query(`
        SELECT *
        FROM withdrawals_view
        WHERE station_id = $1 OR (station_id IS NULL AND location_snapshot = $2)
        ORDER BY created_at DESC, id DESC
      `, [station.id, station.name]),

      // 4. Inventory Transactions at this station
      query(`
        SELECT *
        FROM transactions_view
        WHERE station_id = $1 OR (station_id IS NULL AND location_snapshot = $2)
        ORDER BY created_at DESC, id DESC
      `, [station.id, station.name]),

      // 5. Overall Stats for this station
      query(`
        SELECT
          COUNT(CASE WHEN type = 'repair' THEN 1 END) as repair_total,
          COUNT(CASE WHEN type = 'claim' THEN 1 END) as claim_total,
          SUM(CASE WHEN TRIM(status) = 'รอดำเนินการ' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN TRIM(status) = 'กำลังซ่อม' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN TRIM(status) = 'รออะไหล่' THEN 1 ELSE 0 END) as on_hold,
          SUM(CASE WHEN TRIM(status) = 'เสร็จสิ้น' THEN 1 ELSE 0 END) as completed
        FROM repairs
        WHERE station_id = $1 OR (station_id IS NULL AND location = $2)
      `, [station.id, station.name])
    ]);

    const repairs = repairsResult.rows;
    const claims = claimsResult.rows;
    const withdrawals = withdrawalsResult.rows;
    const transactions = transactionsResult.rows;
    const stats = statsResult.rows[0] || {};

    // Fetch withdrawal items for withdrawals
    const withdrawalIds = withdrawals.map(w => w.id);
    let withdrawalItemsMap = {};

    if (withdrawalIds.length > 0) {
      const placeholders = withdrawalIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows: items } = await query(`
        SELECT wi.*, i.name as item_name, i.model as item_model, i.description as item_description, i.image_path as item_image, i.requires_sn
        FROM withdrawal_items wi
        JOIN inventory i ON wi.inventory_id = i.id
        WHERE wi.withdrawal_id IN (${placeholders})
      `, withdrawalIds);

      // Group items by withdrawal_id
      items.forEach(item => {
        if (!withdrawalItemsMap[item.withdrawal_id]) {
          withdrawalItemsMap[item.withdrawal_id] = [];
        }
        withdrawalItemsMap[item.withdrawal_id].push(item);
      });
    }

    // Attach items to withdrawals
    const withdrawalsWithItems = withdrawals.map(w => ({
      ...w,
      items: withdrawalItemsMap[w.id] || []
    }));

    // Manual asset condition statuses for this station (keyed by inventory_id on the client)
    const assetStatuses = station.id
      ? (await query(
          `SELECT inventory_id, status, note, updated_by, updated_at
           FROM station_asset_status WHERE station_id = $1`,
          [station.id]
        )).rows
      : [];

    // Fetch individual inventory instances deployed at this station
    const instances = station.id
      ? (await query(
          `SELECT id, inventory_id, serial_number, condition, status, updated_at,
                  created_at, station_id, source_withdrawal_id, withdrawal_date,
                  project_name_snapshot, contract_id, contract_no_snapshot,
                  contract_name_snapshot, contract_year_snapshot,
                  contract_company_snapshot
           FROM inventory_instances WHERE station_id = $1`,
          [station.id]
        )).rows
      : [];

    const [assetSummaryResult, assetLotsResult, assetEventsResult] = station.id
      ? await Promise.all([
          query(`
            SELECT $1::BIGINT AS station_id, i.id AS inventory_id,
                   GREATEST(COALESCE(si.quantity, 0), COUNT(ii.id)::INTEGER) AS current_quantity,
                   i.name AS device_name, i.model, i.image_path, i.requires_sn,
                   COUNT(ii.id)::INTEGER AS serial_count,
                   MAX(COALESCE(ii.withdrawal_date, ii.created_at::date)) AS latest_serial_date
            FROM inventory i
            LEFT JOIN station_inventory si
              ON si.station_id = $1 AND si.inventory_id = i.id
            LEFT JOIN inventory_instances ii
              ON ii.station_id = $1
             AND ii.inventory_id = i.id
             AND ii.status = 'Withdrawn'
            WHERE (COALESCE(si.quantity, 0) > 0 OR ii.id IS NOT NULL)
            GROUP BY i.id, si.quantity,
                     i.name, i.model, i.image_path, i.requires_sn
            ORDER BY i.name ASC, i.model ASC
          `, [station.id]),
          query(`
            SELECT l.id, l.station_id, l.inventory_id, l.withdrawal_id,
                   l.withdrawal_item_id, l.quantity_received, l.quantity_remaining,
                   l.untracked_remaining, l.withdrawal_date, l.project_name_snapshot,
                   l.contract_id, l.contract_no_snapshot, l.contract_name_snapshot,
                   l.contract_year_snapshot, l.contract_company_snapshot,
                   i.name AS device_name, i.model
            FROM station_inventory_lots l
            JOIN inventory i ON i.id = l.inventory_id
            WHERE l.station_id = $1 AND l.quantity_remaining > 0
            ORDER BY l.withdrawal_date DESC NULLS LAST, l.id DESC
          `, [station.id]),
          query(`
            SELECT e.*, i.name AS device_name, i.model,
                   s_from.name AS from_station_name,
                   s_to.name AS to_station_name
            FROM station_asset_events e
            LEFT JOIN inventory i ON i.id = e.inventory_id
            LEFT JOIN stations s_from ON s_from.id = e.from_station_id
            LEFT JOIN stations s_to ON s_to.id = e.to_station_id
            WHERE e.station_id = $1 OR e.from_station_id = $1 OR e.to_station_id = $1
            ORDER BY e.event_at DESC, e.id DESC
            LIMIT 300
          `, [station.id])
        ])
      : [{ rows: [] }, { rows: [] }, { rows: [] }];

    res.json({
      station: station,
      stats: {
        repair_total: Number(stats.repair_total) || 0,
        claim_total: Number(stats.claim_total) || 0,
        pending: Number(stats.pending) || 0,
        in_progress: Number(stats.in_progress) || 0,
        on_hold: Number(stats.on_hold) || 0,
        completed: Number(stats.completed) || 0,
        withdrawal_total: withdrawals.length
      },
      repairs,
      claims,
      withdrawals: withdrawalsWithItems,
      transactions,
      asset_statuses: assetStatuses,
      instances,
      assets: assetSummaryResult.rows.map(asset => ({
        ...asset,
        source_lots: assetLotsResult.rows.filter(lot => lot.inventory_id === asset.inventory_id),
      })),
      asset_events: assetEventsResult.rows
    });
  } catch (err) {
    console.error('Get Station Details Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.upsertAssetStatus = async (req, res) => {
  const { stationId, inventoryId } = req.params;
  const { status, note } = req.body;

  if (!status || !VALID_ASSET_STATUSES.includes(status)) {
    return res.status(400).json({ error: `สภาพอุปกรณ์ไม่ถูกต้อง (ต้องเป็น ${VALID_ASSET_STATUSES.join(', ')})` });
  }

  const updatedBy = (req.user && req.user.full_name) || 'System/Admin';
  const noteVal = note != null && String(note).trim() !== '' ? String(note).trim() : null;

  try {
    const { rows: oldRows } = await query(
      'SELECT * FROM station_asset_status WHERE station_id = $1 AND inventory_id = $2',
      [stationId, inventoryId]
    );
    const old = oldRows[0];

    await query(`
      INSERT INTO station_asset_status (station_id, inventory_id, status, note, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (station_id, inventory_id)
      DO UPDATE SET status = excluded.status, note = excluded.note,
                    updated_by = excluded.updated_by, updated_at = NOW()
    `, [stationId, inventoryId, status, noteVal, updatedBy]);

    const { rows } = await query(
      'SELECT inventory_id, status, note, updated_by, updated_at FROM station_asset_status WHERE station_id = $1 AND inventory_id = $2',
      [stationId, inventoryId]
    );
    const row = rows[0];

    logAudit('asset_status', inventoryId, 'update', old, { station_id: Number(stationId), ...row }, updatedBy)
      .catch(e => console.error(e));

    res.json(row);
  } catch (err) {
    console.error('Upsert Asset Status Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.verifyStation = async (req, res) => {
  const { id } = req.params;
  const verifiedBy = req.user?.full_name || 'System/Admin';
  try {
    const { rows } = await query(`
      UPDATE stations
      SET last_verified_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 1
      RETURNING *
    `, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบสถานีที่เปิดใช้งานอยู่' });
    logAudit('station', id, 'verify', null, { last_verified_at: rows[0].last_verified_at }, verifiedBy)
      .catch(e => console.error(e));
    res.json(rows[0]);
  } catch (err) {
    console.error('Verify Station Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.moveAsset = async (req, res) => {
  const { stationId } = req.params;
  const { inventory_id, instance_id, quantity = 1, to_station_id, note } = req.body;
  const performedBy = req.user?.full_name || 'System/Admin';
  const qty = Number(quantity);

  if (!to_station_id || String(to_station_id) === String(stationId)) {
    return res.status(400).json({ error: 'กรุณาเลือกสถานีปลายทางที่แตกต่างจากสถานีเดิม' });
  }
  if (!inventory_id || !Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ error: 'ข้อมูลอุปกรณ์หรือจำนวนย้ายไม่ถูกต้อง' });
  }
  if (instance_id && qty !== 1) {
    return res.status(400).json({ error: 'อุปกรณ์ที่มี S/N ย้ายได้ครั้งละ 1 เครื่อง' });
  }

  try {
    await validateStationExists(Number(stationId));
    await validateStationExists(Number(to_station_id));

    const result = await withTransaction(async (client) => {
      const { rows: lockedStations } = await client.query(`
        SELECT id, name FROM stations
        WHERE id IN ($1, $2) AND status = 1
        FOR UPDATE
      `, [stationId, to_station_id]);
      if (lockedStations.length !== 2) {
        const err = new Error('สถานีต้นทางหรือปลายทางไม่พร้อมใช้งาน');
        err.status = 409;
        throw err;
      }
      const targetName = lockedStations.find(row => String(row.id) === String(to_station_id))?.name || String(to_station_id);

      let moved = [];
      if (instance_id) {
        const { rows } = await client.query(`
          SELECT ii.*, s.name AS from_station_name
          FROM inventory_instances ii
          LEFT JOIN stations s ON s.id = ii.station_id
          WHERE ii.id = $1 AND ii.inventory_id = $2 AND ii.station_id = $3 AND ii.status = 'Withdrawn'
          FOR UPDATE
        `, [instance_id, inventory_id, stationId]);
        const instance = rows[0];
        if (!instance) {
          const err = new Error('ไม่พบอุปกรณ์ S/N นี้ที่สถานีต้นทาง');
          err.status = 400;
          throw err;
        }

        await client.query(`
          UPDATE inventory_instances
          SET station_id = $1, current_location = $2, updated_at = NOW()
          WHERE id = $3
        `, [to_station_id, targetName, instance_id]);

        const sourceBalanceUpdate = await client.query(`
          UPDATE station_inventory SET quantity = quantity - 1, updated_at = NOW()
          WHERE station_id = $1 AND inventory_id = $2 AND quantity >= 1
          RETURNING quantity
        `, [stationId, inventory_id]);
        if (sourceBalanceUpdate.rowCount !== 1) {
          const err = new Error('ยอดอุปกรณ์ที่สถานีต้นทางไม่เพียงพอ');
          err.status = 409;
          throw err;
        }
        await client.query(`DELETE FROM station_inventory WHERE station_id = $1 AND inventory_id = $2 AND quantity = 0`, [stationId, inventory_id]);
        await client.query(`
          INSERT INTO station_inventory (station_id, inventory_id, quantity, updated_by, updated_at)
          VALUES ($1, $2, 1, $3, NOW())
          ON CONFLICT (station_id, inventory_id) DO UPDATE
            SET quantity = station_inventory.quantity + 1, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        `, [to_station_id, inventory_id, performedBy]);

        if (instance.source_withdrawal_id) {
          const { rows: sourceLotRows } = await client.query(`
            SELECT * FROM station_inventory_lots
            WHERE station_id = $1 AND inventory_id = $2 AND withdrawal_id = $3 AND quantity_remaining > 0
            ORDER BY withdrawal_date ASC NULLS LAST, id ASC
            LIMIT 1
            FOR UPDATE
          `, [stationId, inventory_id, instance.source_withdrawal_id]);
          const sourceLot = sourceLotRows[0];
          if (!sourceLot) {
            const err = new Error('ไม่พบ lot ต้นทางของ S/N ที่ต้องการย้าย');
            err.status = 409;
            throw err;
          }
          await client.query(`
            UPDATE station_inventory_lots
            SET quantity_remaining = quantity_remaining - 1, updated_at = NOW()
            WHERE id = $1
          `, [sourceLot.id]);
          await client.query(`
            INSERT INTO station_inventory_lots (
              station_id, inventory_id, withdrawal_id, withdrawal_item_id, quantity_received, quantity_remaining,
              untracked_remaining, withdrawal_date, project_name_snapshot, contract_id,
              contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
              contract_company_snapshot
            ) VALUES ($1,$2,$3,$4,1,1,0,$5,$6,$7,$8,$9,$10,$11)
          `, [
            to_station_id, inventory_id, instance.source_withdrawal_id, sourceLot.withdrawal_item_id || null,
            instance.withdrawal_date || null,
            instance.project_name_snapshot || null, instance.contract_id || null,
            instance.contract_no_snapshot || null, instance.contract_name_snapshot || null,
            instance.contract_year_snapshot || null, instance.contract_company_snapshot || null
          ]);
        }

        // Keep the active return source aligned with the instance's current
        // station so Pending Returns cannot return it from the old station.
        await client.query(`
          WITH active_source AS (
            SELECT id FROM inventory_transactions
            WHERE instance_id = $1
              AND transaction_type IN ('WITHDRAW', 'BORROW')
              AND status <> 'RETURNED'
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
          )
          UPDATE inventory_transactions t
          SET station_id = $2, location = $3
          FROM active_source src
          WHERE t.id = src.id
        `, [instance_id, to_station_id, targetName]);

        await client.query(`
          INSERT INTO station_asset_events (
            station_id, inventory_id, instance_id, event_type, quantity,
            from_station_id, to_station_id, source_withdrawal_id,
            project_name_snapshot, contract_id, contract_no_snapshot,
            contract_name_snapshot, contract_year_snapshot, note, performed_by
          ) VALUES ($1,$2,$3,'TRANSFER',1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [
          to_station_id, inventory_id, instance_id, stationId, to_station_id,
          instance.source_withdrawal_id, instance.project_name_snapshot || null,
          instance.contract_id || null, instance.contract_no_snapshot || null,
          instance.contract_name_snapshot || null, instance.contract_year_snapshot || null,
          note || null, performedBy
        ]);
        moved = [{ instance_id: Number(instance_id), quantity: 1 }];
      } else {
        const { rows: sourceLots } = await client.query(`
          SELECT * FROM station_inventory_lots
          WHERE station_id = $1 AND inventory_id = $2 AND untracked_remaining > 0
          ORDER BY withdrawal_date ASC NULLS LAST, id ASC
          FOR UPDATE
        `, [stationId, inventory_id]);
        const sourceTotal = sourceLots.reduce((sum, lot) => sum + Number(lot.untracked_remaining || 0), 0);
        if (sourceTotal < qty) {
          const err = new Error(`อุปกรณ์ที่สถานีมีไม่พอสำหรับย้าย (มี ${sourceTotal} ชิ้น)`);
          err.status = 400;
          throw err;
        }

        let remaining = qty;
        for (const lot of sourceLots) {
          if (remaining <= 0) break;
          const moveQty = Math.min(remaining, Number(lot.untracked_remaining));
          await client.query(`
            UPDATE station_inventory_lots
            SET quantity_remaining = quantity_remaining - $1,
                untracked_remaining = GREATEST(0, untracked_remaining - $1), updated_at = NOW()
            WHERE id = $2
          `, [moveQty, lot.id]);
          await client.query(`
            INSERT INTO station_inventory_lots (
              station_id, inventory_id, withdrawal_id, withdrawal_item_id, quantity_received, quantity_remaining,
              untracked_remaining, withdrawal_date, project_name_snapshot, contract_id,
              contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
              contract_company_snapshot
            ) VALUES ($1,$2,$3,$4,$5,$5,$5,$6,$7,$8,$9,$10,$11,$12)
          `, [
            to_station_id, inventory_id, lot.withdrawal_id || null, lot.withdrawal_item_id || null,
            moveQty, lot.withdrawal_date || null,
            lot.project_name_snapshot || null, lot.contract_id || null,
            lot.contract_no_snapshot || null, lot.contract_name_snapshot || null,
            lot.contract_year_snapshot || null, lot.contract_company_snapshot || null
          ]);
          await client.query(`
            INSERT INTO station_asset_events (
              station_id, inventory_id, event_type, quantity, from_station_id, to_station_id,
              source_withdrawal_id, project_name_snapshot, contract_id, contract_no_snapshot,
              contract_name_snapshot, contract_year_snapshot, note, performed_by
            ) VALUES ($1,$2,'TRANSFER',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `, [
            to_station_id, inventory_id, moveQty, stationId, to_station_id, lot.withdrawal_id || null,
            lot.project_name_snapshot || null, lot.contract_id || null, lot.contract_no_snapshot || null,
            lot.contract_name_snapshot || null, lot.contract_year_snapshot || null, note || null, performedBy
          ]);

          if (lot.withdrawal_id) {
            const { rows: sourceTransactionRows } = await client.query(`
              SELECT * FROM inventory_transactions
              WHERE withdrawal_id = $1
                AND inventory_id = $2
                AND station_id = $3
                AND instance_id IS NULL
                AND transaction_type = 'WITHDRAW'
                AND status <> 'RETURNED'
              ORDER BY id ASC
              LIMIT 1
              FOR UPDATE
            `, [lot.withdrawal_id, inventory_id, stationId]);
            const sourceTransaction = sourceTransactionRows[0];
            if (!sourceTransaction || Number(sourceTransaction.quantity_withdrawn) < moveQty) {
              const err = new Error('ไม่พบรายการเบิกต้นทางที่เพียงพอสำหรับการย้าย');
              err.status = 409;
              throw err;
            }

            if (Number(sourceTransaction.quantity_withdrawn) === moveQty) {
              await client.query(`
                UPDATE inventory_transactions
                SET station_id = $1, location = $2
                WHERE id = $3
              `, [to_station_id, targetName, sourceTransaction.id]);
            } else {
              await client.query(`
                UPDATE inventory_transactions
                SET quantity_withdrawn = quantity_withdrawn - $1
                WHERE id = $2
              `, [moveQty, sourceTransaction.id]);
              await client.query(`
                INSERT INTO inventory_transactions (
                  inventory_id, transaction_type, quantity_withdrawn,
                  project_name, location, station_id, contract_id,
                  user_name, note, withdrawal_id, status, created_at
                ) VALUES ($1,'WITHDRAW',$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',$10)
              `, [
                inventory_id, moveQty, sourceTransaction.project_name, targetName,
                to_station_id, sourceTransaction.contract_id, sourceTransaction.user_name,
                sourceTransaction.note, sourceTransaction.withdrawal_id, sourceTransaction.created_at
              ]);
            }
          }
          remaining -= moveQty;
        }

        const sourceBalanceUpdate = await client.query(`
          UPDATE station_inventory SET quantity = quantity - $1, updated_at = NOW()
          WHERE station_id = $2 AND inventory_id = $3 AND quantity >= $1
          RETURNING quantity
        `, [qty, stationId, inventory_id]);
        if (sourceBalanceUpdate.rowCount !== 1) {
          const err = new Error('ยอดอุปกรณ์ที่สถานีต้นทางไม่เพียงพอ');
          err.status = 409;
          throw err;
        }
        await client.query(`DELETE FROM station_inventory WHERE station_id = $1 AND inventory_id = $2 AND quantity = 0`, [stationId, inventory_id]);
        await client.query(`
          INSERT INTO station_inventory (station_id, inventory_id, quantity, updated_by, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (station_id, inventory_id) DO UPDATE
            SET quantity = station_inventory.quantity + EXCLUDED.quantity, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        `, [to_station_id, inventory_id, qty, performedBy]);
        moved = [{ quantity: qty }];
      }
      return moved;
    });

    logAudit('station_asset', Number(inventory_id), 'transfer', null, { from_station_id: Number(stationId), to_station_id: Number(to_station_id), instance_id: instance_id || null, quantity: qty, note }, performedBy)
      .catch(e => console.error(e));
    res.json({ message: 'ย้ายอุปกรณ์เรียบร้อยแล้ว', moved: result });
  } catch (err) {
    console.error('Move Station Asset Error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.createStation = async (req, res) => {
  const { name, station_type, highway_no, direction, region, province, responsible_person, operational_start_date } = req.body;
  if (!name || !station_type || !highway_no || !direction || !region || !province || !responsible_person) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง (รวมถึง "ผู้รับผิดชอบสถานี")' });
  }

  try {
    const { rows: maxRows } = await query('SELECT MAX(id) as "maxId" FROM stations');
    const maxId = maxRows[0] ? maxRows[0].maxId : 0;
    const nextId = (Number(maxId) || 0) + 1;

    let shortDir = 'NONE';
    if (direction === 'INBOUND') shortDir = 'IN';
    else if (direction === 'OUTBOUND') shortDir = 'OUT';
    else if (direction === 'BOTH') shortDir = 'BOTH';
    else if (direction === 'NONE') shortDir = 'NONE';

    const code = `STN-${nextId}-${shortDir}`;

    const { rows } = await query(`
      INSERT INTO stations (code, name, station_type, highway_no, direction, region, province, responsible_person, operational_start_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [code, name.trim(), station_type, highway_no.trim(), direction, region, province, responsible_person.trim(), operational_start_date || null]);

    const row = rows[0];
    logAudit('station', row.id, 'create', null, row, 'System/Admin').catch(e => console.error(e));
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'ชื่อสถานีนี้มีอยู่แล้วในระบบ' });
    }
    console.error('Create Station Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStation = async (req, res) => {
  const { id } = req.params;
  const deleted_by = 'System/Admin';

  try {
    const { rows: oldRows } = await query('SELECT * FROM stations WHERE id = $1', [id]);
    const oldStation = oldRows[0];
    if (!oldStation) return res.status(404).json({ error: 'ไม่พบสถานีที่ต้องการลบ' });

    const { rows } = await query(`
      UPDATE stations
      SET status = 0, deleted_at = NOW(), deleted_by = $1
      WHERE id = $2
      RETURNING *
    `, [deleted_by, id]);

    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบสถานีที่ต้องการลบ' });

    logAudit('station', id, 'deactivate', oldStation, { ...oldStation, status: 0, deleted_at: new Date().toISOString() }, deleted_by).catch(e => console.error(e));

    res.json({ message: 'ปิดใช้งานสถานีเรียบร้อยแล้ว (Soft Delete)' });
  } catch (err) {
    console.error('Delete Station Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateStation = async (req, res) => {
  const { id } = req.params;
  const { name, station_type, highway_no, direction, region, province, responsible_person, operational_start_date } = req.body;

  if (!name || !station_type || !highway_no || !direction || !region || !province || !responsible_person) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง (รวมถึง "ผู้รับผิดชอบสถานี")' });
  }

  try {
    const { rows: oldRows } = await query('SELECT * FROM stations WHERE id = $1', [id]);
    const oldStation = oldRows[0];
    if (!oldStation) return res.status(404).json({ error: 'ไม่พบสถานีที่ต้องการแก้ไข' });

    let shortDir = 'NONE';
    if (direction === 'INBOUND') shortDir = 'IN';
    else if (direction === 'OUTBOUND') shortDir = 'OUT';
    else if (direction === 'BOTH') shortDir = 'BOTH';
    else if (direction === 'NONE') shortDir = 'NONE';

    const code = `STN-${id}-${shortDir}`;

    const { rows } = await query(`
      UPDATE stations
      SET code = $1, name = $2, station_type = $3, highway_no = $4, direction = $5, region = $6, province = $7, responsible_person = $8, operational_start_date = $9, updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [code, name.trim(), station_type, highway_no.trim(), direction, region, province, responsible_person.trim(), operational_start_date || null, id]);

    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ไม่พบสถานีที่ต้องการแก้ไข' });

    logAudit('station', id, 'update', oldStation, row, 'System/Admin').catch(e => console.error(e));
    res.json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'ชื่อสถานีนี้มีอยู่แล้วในระบบ' });
    }
    console.error('Update Station Error:', err);
    res.status(500).json({ error: err.message });
  }
};
