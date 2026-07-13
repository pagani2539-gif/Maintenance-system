const { query, withTransaction } = require('../database/db');
const { logTransaction } = require('./transactions');
const { validateStationExists, validateStationAreaBelongsToStation, getStationSnapshotName } = require('../utils/stationValidation');
const { logAudit } = require('../utils/auditLogger');
const { sendLineNotify } = require('../utils/lineNotify');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');
const { INSTANCE_STATUS } = require('../utils/constants');
const { requirePositiveInteger, cleanAndValidateSerials } = require('../utils/stockValidation');

const addStationInventory = async (client, { stationId, inventoryId, quantity, updatedBy }) => {
  if (!stationId || !quantity) return;

  await client.query(`
    INSERT INTO station_inventory (station_id, inventory_id, quantity, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (station_id, inventory_id) DO UPDATE
      SET quantity = station_inventory.quantity + EXCLUDED.quantity,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
  `, [stationId, inventoryId, quantity, updatedBy]);
};

const addStationInventoryLot = async (client, {
  stationId,
  inventoryId,
  withdrawalId,
  withdrawalItemId,
  quantity,
  serialQuantity = 0,
  withdrawalDate,
  projectName,
  contractId,
  contractSnapshot,
}) => {
  if (!stationId || !quantity) return;

  await client.query(`
    INSERT INTO station_inventory_lots (
      station_id, inventory_id, withdrawal_id, withdrawal_item_id,
      quantity_received, quantity_remaining, untracked_remaining,
      withdrawal_date, project_name_snapshot, contract_id,
      contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
      contract_company_snapshot
    )
    VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `, [
    stationId, inventoryId, withdrawalId, withdrawalItemId, quantity,
    Math.max(0, quantity - serialQuantity), withdrawalDate, projectName || null,
    contractId || null, contractSnapshot?.contract_no || null,
    contractSnapshot?.name || null, contractSnapshot?.year_be || null,
    contractSnapshot?.company_name || null
  ]);
};

const addStationAssetEvent = async (client, {
  stationId,
  inventoryId,
  instanceId,
  eventType,
  quantity = 0,
  eventAt,
  sourceWithdrawalId,
  projectName,
  contractId,
  contractSnapshot,
  note,
  performedBy,
  oldSerial,
  newSerial,
}) => {
  if (!stationId || !inventoryId) return;
  await client.query(`
    INSERT INTO station_asset_events (
      station_id, inventory_id, instance_id, event_type, event_at, quantity,
      source_withdrawal_id, project_name_snapshot, contract_id,
      contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
      old_serial_number, new_serial_number, note, performed_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  `, [
    stationId, inventoryId, instanceId || null, eventType, eventAt || new Date(), quantity,
    sourceWithdrawalId || null, projectName || null, contractId || null,
    contractSnapshot?.contract_no || null, contractSnapshot?.name || null,
    contractSnapshot?.year_be || null, oldSerial || null, newSerial || null,
    note || null, performedBy || null
  ]);
};

/**
 * Send a LINE notification summarising a completed withdrawal.
 * Fires once per withdrawal (not per item) after the transaction is committed.
 */
const notifyWithdrawal = async (withdrawalId) => {
  try {
    const { rows } = await query(`
      SELECT w.recipient, w.type, w.project_name, w.location, w.note,
        (SELECT STRING_AGG(i.name || ' x' || wi.quantity ||
           (CASE WHEN wi.serial_numbers IS NOT NULL THEN ' [S/N: ' || wi.serial_numbers || ']' ELSE '' END), '|||')
         FROM withdrawal_items wi
         JOIN inventory i ON wi.inventory_id = i.id
         WHERE wi.withdrawal_id = w.id) as items_summary
      FROM withdrawals w
      WHERE w.id = $1
    `, [withdrawalId]);
    const row = rows[0];
    if (!row) return;

    const itemsList = (row.items_summary || '')
      .split('|||')
      .filter(Boolean)
      .map(line => `• ${line}`)
      .join('\n');
    const place = row.project_name || row.location;

    let msg = `\n📦 *มีการเบิกอุปกรณ์*\n🔢 เลขที่ใบเบิก: #${withdrawalId}\n👤 ผู้เบิก: ${row.recipient || '-'}`;
    if (row.type) msg += `\n🛠️ ประเภท: ${row.type}`;
    if (place) msg += `\n📍 สถานที่: ${place}`;
    if (itemsList) msg += `\n📋 รายการอุปกรณ์:\n${itemsList}`;
    if (row.note) msg += `\n💬 หมายเหตุ: ${row.note}`;

    sendLineNotify('stock', msg);
  } catch (err) {
    console.error('Failed to build withdrawal LINE notification:', err.message);
  }
};

exports.getAllWithdrawals = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT w.*,
        (SELECT STRING_AGG(i.name || ' x' || wi.quantity || (CASE WHEN wi.serial_numbers IS NOT NULL THEN ' [S/N: ' || wi.serial_numbers || ']' ELSE '' END), ',')
         FROM withdrawal_items wi
         JOIN inventory i ON wi.inventory_id = i.id
         WHERE wi.withdrawal_id = w.id) as items_summary,
        (SELECT COUNT(*) FROM withdrawal_items wi
         JOIN inventory i2 ON wi.inventory_id = i2.id
         WHERE wi.withdrawal_id = w.id
         AND i2.requires_sn = 1
         AND (wi.serial_numbers IS NULL OR
              (LENGTH(wi.serial_numbers) - LENGTH(REPLACE(wi.serial_numbers, ',', '')) + 1) < wi.quantity)
        ) as items_missing_sn
      FROM withdrawals_view w
      ORDER BY w.created_at DESC, w.id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createWithdrawal = async (req, res) => {
  const {
    type,
    note,
    items,
    project_name,
    location,
    station_id,
    station_area_id,
    return_due_date,
    contract_id,
    withdrawal_date,
    contract_reference_type: requestedReferenceType,
    contract_reference_note
  } = req.body;
  const recipient = req.user.full_name;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'กรุณาเลือกอุปกรณ์ที่ต้องการเบิก' });
  }

  const inventoryKeys = new Set();
  for (const item of items) {
    try {
      const inventoryId = requirePositiveInteger(item?.inventory_id, 'รหัสอุปกรณ์');
      requirePositiveInteger(item?.quantity, 'จำนวนเบิก');
      cleanAndValidateSerials(item?.serial_numbers, {
        maxQuantity: Number(item.quantity),
        label: 'S/N',
      });
      if (inventoryKeys.has(inventoryId)) {
        return res.status(400).json({ message: 'ไม่สามารถเบิกอุปกรณ์ชนิดเดียวกันซ้ำหลายบรรทัดได้' });
      }
      inventoryKeys.add(inventoryId);
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }
  }

  const referenceType = requestedReferenceType || (contract_id ? 'contract' : 'legacy');
  if (!['contract', 'none', 'legacy'].includes(referenceType)) {
    return res.status(400).json({ message: 'ประเภทเอกสารอ้างอิงไม่ถูกต้อง' });
  }
  if (referenceType === 'contract' && !contract_id) {
    return res.status(400).json({ message: 'กรุณาเลือกสัญญาที่ใช้กับการเบิกครั้งนี้ หรือระบุว่าไม่มีสัญญา' });
  }
  if (referenceType === 'none' && (!contract_reference_note || !String(contract_reference_note).trim())) {
    return res.status(400).json({ message: 'กรุณาระบุเหตุผลกรณีไม่ผูกสัญญา' });
  }
  if (referenceType !== 'contract' && contract_id) {
    return res.status(400).json({ message: 'รายการที่ไม่ผูกสัญญาต้องไม่ส่งรหัสสัญญา' });
  }

  const effectiveWithdrawalDate = withdrawal_date || new Date().toISOString().slice(0, 10);
  const parsedWithdrawalDate = new Date(`${effectiveWithdrawalDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveWithdrawalDate)
      || Number.isNaN(parsedWithdrawalDate.getTime())
      || parsedWithdrawalDate.toISOString().slice(0, 10) !== effectiveWithdrawalDate) {
    return res.status(400).json({ message: 'วันที่เบิกจริงไม่ถูกต้อง' });
  }

  try {
    await validateStationExists(station_id);
    await validateStationAreaBelongsToStation(station_id, station_area_id);
    let officialLocation = (station_id ? await getStationSnapshotName(station_id) : null) || location;
    if (station_id && location && typeof location === 'string' && officialLocation && location.startsWith(officialLocation)) {
      officialLocation = location;
    }

    let contractSnapshot = null;
    if (contract_id) {
      const { rows: contractRows } = await query(`
        SELECT c.id, c.contract_no, c.name, c.year_be, co.name_th AS company_name
        FROM contracts c
        LEFT JOIN companies co ON co.id = c.company_id
        WHERE c.id = $1
      `, [contract_id]);
      contractSnapshot = contractRows[0] || null;
      if (!contractSnapshot) {
        return res.status(400).json({ message: 'ไม่พบสัญญาที่เลือกในระบบ' });
      }
    }

    const withdrawalId = await withTransaction(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO withdrawals (
          recipient, type, note, project_name, location, station_id, station_area_id,
          return_due_date, contract_id, withdrawal_date, contract_reference_type,
          contract_reference_note, contract_no_snapshot, contract_name_snapshot,
          contract_year_snapshot, contract_company_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `, [
        recipient, type, note, project_name || null, officialLocation, station_id || null,
        station_area_id || null, return_due_date || null, contract_id || null,
        effectiveWithdrawalDate, referenceType, contract_reference_note || null,
        contractSnapshot?.contract_no || null, contractSnapshot?.name || null,
        contractSnapshot?.year_be || null, contractSnapshot?.company_name || null
      ]);

      const newWithdrawalId = rows[0].id;

      for (const item of items) {
        const itemQuantity = requirePositiveInteger(item.quantity, 'จำนวนเบิก');
        const providedSns = cleanAndValidateSerials(item.serial_numbers, {
          maxQuantity: itemQuantity,
          label: 'S/N',
        });

        // Atomically check-and-decrement in one statement so two concurrent
        // withdrawals of the same low-stock item can't both pass a stale
        // read and drive quantity negative.
        const { rows: decRows } = await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
           WHERE id = $2 AND quantity >= $1
           RETURNING name, quantity, min_stock`,
          [itemQuantity, item.inventory_id]
        );
        if (decRows.length === 0) {
          const { rows: nameRows } = await client.query('SELECT name FROM inventory WHERE id = $1', [item.inventory_id]);
          const err = new Error(nameRows[0] ? `อุปกรณ์ "${nameRows[0].name}" คงเหลือไม่เพียงพอ` : 'ไม่พบข้อมูลอุปกรณ์บางรายการ');
          err.status = 400;
          throw err;
        }
        const invCheck = decRows[0];

        // Insert withdrawal item with comma-separated serial numbers
        const serialNumbersStr = providedSns.length > 0 ? providedSns.join(', ') : null;

        const { rows: itemRows } = await client.query(`
          INSERT INTO withdrawal_items (withdrawal_id, inventory_id, quantity, serial_numbers)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [newWithdrawalId, item.inventory_id, itemQuantity, serialNumbersStr]);
        const withdrawalItemId = itemRows[0]?.id;

        // Every withdrawal to a station belongs to that station immediately.
        // S/N is optional here and can be registered later without changing
        // the station assignment or decrementing stock a second time.
        await addStationInventory(client, {
          stationId: station_id,
          inventoryId: item.inventory_id,
          quantity: itemQuantity,
          updatedBy: recipient,
        });

        await addStationInventoryLot(client, {
          stationId: station_id,
          inventoryId: item.inventory_id,
          withdrawalId: newWithdrawalId,
          withdrawalItemId,
          quantity: itemQuantity,
          serialQuantity: providedSns.length,
          withdrawalDate: effectiveWithdrawalDate,
          projectName: project_name,
          contractId: contract_id,
          contractSnapshot,
        });

        await addStationAssetEvent(client, {
          stationId: station_id,
          inventoryId: item.inventory_id,
          eventType: 'WITHDRAW_TO_STATION',
          quantity: itemQuantity,
          eventAt: `${effectiveWithdrawalDate}T00:00:00.000Z`,
          sourceWithdrawalId: newWithdrawalId,
          projectName: project_name,
          contractId: contract_id,
          contractSnapshot,
          note: note,
          performedBy: recipient,
        });

        // Check if stock is now below min_stock
        if (invCheck.quantity < invCheck.min_stock) {
          const stockAlertMsg = `\n⚠️ *อุปกรณ์ต่ำกว่าเกณฑ์ขั้นต่ำ!*\nพัสดุ: ${invCheck.name}\nคงเหลือ: ${invCheck.quantity} ชิ้น (เกณฑ์ขั้นต่ำ: ${invCheck.min_stock} ชิ้น)`;
          sendLineNotify('stock', stockAlertMsg);
        }

        if (providedSns.length > 0) {
          for (const sn of providedSns) {
            const { rows: snRows } = await client.query(`
              SELECT id, inventory_id, status, station_id, current_location
              FROM inventory_instances
              WHERE LOWER(serial_number) = LOWER($1)
              FOR UPDATE
            `, [sn]);
            const row = snRows[0];

            if (row && row.inventory_id !== item.inventory_id) {
              const err = new Error(`หมายเลขเครื่อง S/N '${sn}' ถูกใช้งานไปแล้วกับอุปกรณ์ประเภทอื่น`);
              err.status = 400;
              throw err;
            }
            if (row && (row.status !== INSTANCE_STATUS.IN_STOCK || row.station_id != null)) {
              const err = new Error(`หมายเลขเครื่อง S/N '${sn}' ถูกใช้งานหรือไม่ได้อยู่ในคลังกลาง`);
              err.status = 409;
              throw err;
            }

            let instanceId;
            if (row) {
              instanceId = row.id;
              await client.query(`
                UPDATE inventory_instances
                SET status = 'Withdrawn', current_location = $1, station_id = $2,
                    contract_id = $3, source_withdrawal_id = $4,
                    withdrawal_date = $5,
                    project_name_snapshot = $6,
                    contract_no_snapshot = $7,
                    contract_name_snapshot = $8,
                    contract_year_snapshot = $9,
                    contract_company_snapshot = $10,
                    updated_at = NOW()
                WHERE id = $11
              `, [
                officialLocation || project_name || 'Withdrawn', station_id || null, contract_id || null,
                newWithdrawalId, effectiveWithdrawalDate, project_name || null,
                contractSnapshot?.contract_no || null, contractSnapshot?.name || null,
                contractSnapshot?.year_be || null, contractSnapshot?.company_name || null, instanceId
              ]);
            } else {
              const { rows: newInst } = await client.query(`
                INSERT INTO inventory_instances (
                  inventory_id, serial_number, status, current_location, station_id, contract_id,
                  source_withdrawal_id, withdrawal_date, project_name_snapshot,
                  contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
                  contract_company_snapshot
                )
                VALUES ($1, $2, 'Withdrawn', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id
              `, [
                item.inventory_id, sn, officialLocation || project_name || 'Withdrawn', station_id || null,
                contract_id || null, newWithdrawalId, effectiveWithdrawalDate, project_name || null,
                contractSnapshot?.contract_no || null, contractSnapshot?.name || null,
                contractSnapshot?.year_be || null, contractSnapshot?.company_name || null
              ]);
              instanceId = newInst[0].id;
            }

            await logTransaction({
              inventory_id: item.inventory_id,
              instance_id: instanceId,
              transaction_type: 'WITHDRAW',
              quantity_withdrawn: 1,
              project_name: project_name,
              location: officialLocation,
              station_id: station_id,
              contract_id: contract_id,
              user_name: recipient,
              note: note,
              withdrawal_id: newWithdrawalId
            }, client);
          }

          // Handle remaining quantity without S/N
          const remainingQty = itemQuantity - providedSns.length;
          if (remainingQty > 0) {
            await logTransaction({
              inventory_id: item.inventory_id,
              transaction_type: 'WITHDRAW',
              quantity_withdrawn: remainingQty,
              project_name: project_name,
              location: officialLocation,
              station_id: station_id,
              contract_id: contract_id,
              user_name: recipient,
              note: note ? `${note} (Remaining qty without S/N)` : '(Remaining qty without S/N)',
              withdrawal_id: newWithdrawalId
            }, client);
          }
        } else {
          // No S/Ns provided, log as bulk
          await logTransaction({
            inventory_id: item.inventory_id,
            transaction_type: 'WITHDRAW',
            quantity_withdrawn: itemQuantity,
            project_name: project_name,
            location: officialLocation,
            station_id: station_id,
            contract_id: contract_id,
            user_name: recipient,
            note: note,
            withdrawal_id: newWithdrawalId
          }, client);
        }
      }

      return newWithdrawalId;
    });

    // Notify LINE that a withdrawal was made (once per withdrawal)
    notifyWithdrawal(withdrawalId);
    // Check and auto generate POs for low stock items in background
    checkAndGenerateAutoPOs().catch((autoPoErr) => {
      console.error('Error auto-generating POs after withdrawal:', autoPoErr.message);
    });

    res.status(201).json({ id: withdrawalId, message: 'บันทึกการเบิกเรียบร้อย' });
  } catch (err) {
    if (!err.status || err.status >= 500) console.error('Create Withdrawal Error:', err);
    // NewWithdrawal.tsx reads `.response.data.message` — keep that field for both
    // validation errors (400, e.g. insufficient stock) and unexpected 500s.
    const status = err.code === '23505' ? 409 : (err.status || 500);
    const message = err.code === '23505' ? 'S/N หรือรายการอุปกรณ์ถูกใช้งานซ้ำ กรุณาโหลดข้อมูลใหม่' : err.message;
    res.status(status).json({ message });
  }
};

exports.updateItemSerialNumbers = async (req, res) => {
  const { id, itemId } = req.params;
  const { serial_numbers } = req.body; // Expecting an array of new S/Ns

  if (!serial_numbers || !Array.isArray(serial_numbers) || serial_numbers.length === 0) {
    return res.status(400).json({ message: 'กรุณาระบุ Serial Numbers' });
  }

  try {
    const { item, updatedSnsStr, newSnsLength } = await withTransaction(async (client) => {
      // 1. Get the current item info
      const { rows } = await client.query(
        `SELECT wi.*, w.recipient, w.project_name, w.location, w.station_id, w.contract_id, w.note,
                w.withdrawal_date, w.contract_no_snapshot, w.contract_name_snapshot,
                w.contract_year_snapshot, w.contract_company_snapshot
         FROM withdrawal_items wi
         JOIN withdrawals w ON wi.withdrawal_id = w.id
         WHERE wi.id = $1 AND wi.withdrawal_id = $2`,
        [itemId, id]
      );
      const item = rows[0];
      if (!item) {
        const err = new Error('ไม่พบรายการเบิกที่ต้องการแก้ไข');
        err.status = 404;
        throw err;
      }

      const existingSns = item.serial_numbers
        ? item.serial_numbers.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const requestedSns = cleanAndValidateSerials(serial_numbers, {
        maxQuantity: Number(item.quantity),
        label: 'S/N',
      });
      const existingKeys = new Set(existingSns.map(sn => sn.toLocaleLowerCase('en-US')));
      const newSns = requestedSns.filter(sn => !existingKeys.has(sn.toLocaleLowerCase('en-US')));

      if (existingSns.length + newSns.length > item.quantity) {
        const err = new Error(`จำนวน S/N รวม (${existingSns.length + newSns.length}) เกินกว่าจำนวนที่เบิก (${item.quantity})`);
        err.status = 400;
        throw err;
      }

      const updatedSnsStr = [...existingSns, ...newSns].join(', ');

      // 2. Update withdrawal_items
      await client.query('UPDATE withdrawal_items SET serial_numbers = $1 WHERE id = $2', [updatedSnsStr, itemId]);

      if (newSns.length === 0) {
        return { item, updatedSnsStr, newSnsLength: 0, skipped: true };
      }

      for (const sn of newSns) {
        // 3. Register/Update inventory_instances
        const { rows: snRows } = await client.query(`
          SELECT id, inventory_id, status, station_id
          FROM inventory_instances
          WHERE LOWER(serial_number) = LOWER($1)
          FOR UPDATE
        `, [sn]);
        const row = snRows[0];

        if (row && row.inventory_id !== item.inventory_id) {
          const err = new Error(`หมายเลขเครื่อง S/N '${sn}' ถูกใช้งานไปแล้วกับอุปกรณ์ประเภทอื่น`);
          err.status = 400;
          throw err;
        }
        if (row && (row.status !== INSTANCE_STATUS.IN_STOCK || row.station_id != null)) {
          const err = new Error(`หมายเลขเครื่อง S/N '${sn}' ถูกใช้งานหรือไม่ได้อยู่ในคลังกลาง`);
          err.status = 409;
          throw err;
        }

        let instanceId;
        if (row) {
          instanceId = row.id;
          await client.query(`
            UPDATE inventory_instances
            SET status = 'Withdrawn', current_location = $1, station_id = $2, contract_id = $3,
                source_withdrawal_id = $4,
                withdrawal_date = $5,
                project_name_snapshot = $6,
                contract_no_snapshot = $7,
                contract_name_snapshot = $8,
                contract_year_snapshot = $9,
                contract_company_snapshot = $10,
                updated_at = NOW()
            WHERE id = $11
          `, [
            item.location || item.project_name || 'Withdrawn', item.station_id || null, item.contract_id || null,
            id, item.withdrawal_date || null, item.project_name || null, item.contract_no_snapshot || null,
            item.contract_name_snapshot || null, item.contract_year_snapshot || null,
            item.contract_company_snapshot || null, instanceId
          ]);
        } else {
          const { rows: newInst } = await client.query(`
            INSERT INTO inventory_instances (
              inventory_id, serial_number, status, current_location, station_id, contract_id,
              source_withdrawal_id, withdrawal_date, project_name_snapshot,
              contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
              contract_company_snapshot
            )
            VALUES ($1, $2, 'Withdrawn', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `, [
            item.inventory_id, sn, item.location || item.project_name || 'Withdrawn', item.station_id || null,
            item.contract_id || null, id, item.withdrawal_date || null, item.project_name || null,
            item.contract_no_snapshot || null, item.contract_name_snapshot || null,
            item.contract_year_snapshot || null, item.contract_company_snapshot || null
          ]);
          instanceId = newInst[0].id;
        }

        // 4. Log Transaction
        await logTransaction({
          inventory_id: item.inventory_id,
          instance_id: instanceId,
          transaction_type: 'WITHDRAW',
          quantity_withdrawn: 1,
          project_name: item.project_name,
          location: item.location,
          station_id: item.station_id,
          contract_id: item.contract_id,
          user_name: item.recipient,
          note: `ระบุ S/N ย้อนหลังสำหรับการเบิก #${id}`,
          withdrawal_id: id
        }, client);

        await addStationAssetEvent(client, {
          stationId: item.station_id,
          inventoryId: item.inventory_id,
          instanceId,
          eventType: 'SERIAL_ASSIGNED',
          quantity: 0,
          eventAt: new Date(),
          sourceWithdrawalId: Number(id),
          projectName: item.project_name,
          contractId: item.contract_id,
          contractSnapshot: {
            contract_no: item.contract_no_snapshot,
            name: item.contract_name_snapshot,
            year_be: item.contract_year_snapshot,
            company_name: item.contract_company_snapshot,
          },
          newSerial: sn,
          note: `ระบุ S/N ย้อนหลังสำหรับการเบิก #${id}`,
          performedBy: req.user?.full_name || item.recipient,
        });
      }

      if (item.station_id) {
        const lotUpdate = await client.query(`
          UPDATE station_inventory_lots
          SET untracked_remaining = untracked_remaining - $1,
              updated_at = NOW()
          WHERE withdrawal_item_id = $2
            AND untracked_remaining >= $1
          RETURNING id
        `, [newSns.length, itemId]);
        if (lotUpdate.rowCount !== 1) {
          const err = new Error('ยอดอุปกรณ์ที่ยังไม่มี S/N ไม่เพียงพอ กรุณาตรวจสอบข้อมูลสถานีก่อน');
          err.status = 409;
          throw err;
        }
      }

      return { item, updatedSnsStr, newSnsLength: newSns.length };
    });

    if (newSnsLength === 0) {
      return res.json({ message: 'อัปเดตเรียบร้อย (ไม่มี S/N ใหม่)' });
    }

    logAudit('withdrawal', id, 'withdrawal update', item, { ...item, serial_numbers: updatedSnsStr }, item.recipient || 'System/Admin').catch(e => console.error(e));
    res.json({ message: 'ระบุ Serial Numbers ย้อนหลังเรียบร้อยแล้ว' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'S/N นี้ถูกใช้งานแล้ว กรุณาโหลดข้อมูลใหม่' });
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ error: err.message });
  }
};

exports.getWithdrawalById = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await query(`SELECT * FROM withdrawals_view WHERE id = $1`, [id]);
    const withdrawal = rows[0];
    if (!withdrawal) return res.status(404).json({ message: 'ไม่พบข้อมูลการเบิก' });

    const { rows: items } = await query(`
      SELECT wi.*, i.name as item_name, i.model as item_model, i.description as item_description, i.image_path as item_image, i.requires_sn
      FROM withdrawal_items wi
      JOIN inventory i ON wi.inventory_id = i.id
      WHERE wi.withdrawal_id = $1
    `, [id]);

    res.json({ ...withdrawal, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteWithdrawal = async (req, res) => {
  const { id } = req.params;
  const cancelledBy = req.user?.full_name || 'System/Admin';

  try {
    const cancelledWithdrawal = await withTransaction(async (client) => {
      const { rows: withdrawalRows } = await client.query(
        'SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE',
        [id]
      );
      const withdrawal = withdrawalRows[0];
      if (!withdrawal) {
        const err = new Error('ไม่พบรายการเบิกที่ต้องการยกเลิก');
        err.status = 404;
        throw err;
      }

      // A withdrawal that has already participated in a return, transfer or
      // replacement must be reversed through those workflows first. Deleting
      // it directly would rewrite stock history and duplicate warehouse stock.
      const { rows: usageRows } = await client.query(`
        SELECT
          EXISTS (
            SELECT 1 FROM inventory_transactions
            WHERE withdrawal_id = $1 AND transaction_type = 'RETURN'
          ) AS has_return,
          EXISTS (
            SELECT 1 FROM station_asset_events
            WHERE source_withdrawal_id = $1
              AND event_type IN ('TRANSFER', 'RETURN_TO_WAREHOUSE', 'REPLACE')
          ) AS has_downstream_event,
          EXISTS (
            SELECT 1 FROM inventory_instances
            WHERE source_withdrawal_id = $1
              AND (status <> $2 OR station_id IS DISTINCT FROM $3::BIGINT)
          ) AS has_moved_instance
      `, [id, INSTANCE_STATUS.WITHDRAWN, withdrawal.station_id]);
      const usage = usageRows[0];
      if (usage.has_return || usage.has_downstream_event || usage.has_moved_instance) {
        const err = new Error('รายการเบิกนี้มีการคืน ย้าย หรือเปลี่ยนอุปกรณ์แล้ว ไม่สามารถลบตรง ๆ ได้');
        err.status = 409;
        throw err;
      }

      // Get items and their station assignment before deleting the record.
      const { rows: items } = await client.query(`
        SELECT wi.inventory_id, wi.quantity, w.station_id
        FROM withdrawal_items wi
        JOIN withdrawals w ON w.id = wi.withdrawal_id
        WHERE wi.withdrawal_id = $1
      `, [id]);

      if (items.length === 0) {
        const err = new Error('รายการเบิกไม่มีข้อมูลอุปกรณ์สำหรับย้อน stock');
        err.status = 409;
        throw err;
      }

      // Return each untouched item to the central warehouse.
      for (const item of items) {
        const inventoryUpdate = await client.query(
          'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING id',
          [item.quantity, item.inventory_id]
        );
        if (inventoryUpdate.rowCount !== 1) {
          const err = new Error('ไม่พบอุปกรณ์บางรายการสำหรับย้อน stock');
          err.status = 409;
          throw err;
        }

        if (item.station_id) {
          const stationUpdate = await client.query(`
            UPDATE station_inventory
            SET quantity = quantity - $1, updated_at = NOW()
            WHERE station_id = $2 AND inventory_id = $3 AND quantity >= $1
            RETURNING quantity
          `, [item.quantity, item.station_id, item.inventory_id]);
          if (stationUpdate.rowCount !== 1) {
            const err = new Error('ยอดอุปกรณ์ที่สถานีไม่ตรงกับรายการเบิก กรุณาตรวจสอบก่อนยกเลิก');
            err.status = 409;
            throw err;
          }
          await client.query(`DELETE FROM station_inventory WHERE station_id = $1 AND inventory_id = $2 AND quantity = 0`, [item.station_id, item.inventory_id]);
        }
      }

      await client.query(`
        UPDATE inventory_instances
        SET status = $1, station_id = NULL, current_location = 'Warehouse',
            source_withdrawal_id = NULL, updated_at = NOW()
        WHERE source_withdrawal_id = $2
      `, [INSTANCE_STATUS.IN_STOCK, id]);

      await client.query('DELETE FROM station_asset_events WHERE source_withdrawal_id = $1', [id]);
      await client.query('DELETE FROM inventory_transactions WHERE withdrawal_id = $1', [id]);
      // Cascades remove withdrawal_items and station_inventory_lots.
      await client.query('DELETE FROM withdrawals WHERE id = $1', [id]);
      return withdrawal;
    });

    logAudit('withdrawal', id, 'cancel', cancelledWithdrawal, null, cancelledBy).catch(e => console.error(e));
    res.json({ message: 'ยกเลิกการเบิกและคืนสต็อกเรียบร้อย' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.updateWithdrawalCompany = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.body;
  try {
    await query(
      'UPDATE withdrawals SET company_id = $1, updated_at = NOW() WHERE id = $2',
      [company_id || null, id]
    );
    res.json({ message: 'อัปเดตข้อมูลบริษัทของใบเบิกสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
