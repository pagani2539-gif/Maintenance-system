const { query } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

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
          `SELECT id, inventory_id, serial_number, condition, status, updated_at
           FROM inventory_instances WHERE station_id = $1`,
          [station.id]
        )).rows
      : [];

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
      instances
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

exports.createStation = async (req, res) => {
  const { name, station_type, highway_no, direction, region, province, responsible_person } = req.body;
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
      INSERT INTO stations (code, name, station_type, highway_no, direction, region, province, responsible_person)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [code, name.trim(), station_type, highway_no.trim(), direction, region, province, responsible_person.trim()]);

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
  const { name, station_type, highway_no, direction, region, province, responsible_person } = req.body;

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
      SET code = $1, name = $2, station_type = $3, highway_no = $4, direction = $5, region = $6, province = $7, responsible_person = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [code, name.trim(), station_type, highway_no.trim(), direction, region, province, responsible_person.trim(), id]);

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
