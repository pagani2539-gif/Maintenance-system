const { query, withTransaction } = require('../database/db');
const { logTransaction } = require('./transactions');
const { validateStationExists, validateStationAreaBelongsToStation, getStationSnapshotName } = require('../utils/stationValidation');
const { logAudit } = require('../utils/auditLogger');
const { sendLineNotify } = require('../utils/lineNotify');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');

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
  const { type, note, items, project_name, location, station_id, station_area_id, return_due_date, contract_id } = req.body;
  const recipient = req.user.full_name;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'กรุณาเลือกอุปกรณ์ที่ต้องการเบิก' });
  }

  try {
    await validateStationExists(station_id);
    await validateStationAreaBelongsToStation(station_id, station_area_id);
    let officialLocation = (station_id ? await getStationSnapshotName(station_id) : null) || location;
    if (station_id && location && typeof location === 'string' && officialLocation && location.startsWith(officialLocation)) {
      officialLocation = location;
    }

    const withdrawalId = await withTransaction(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO withdrawals (recipient, type, note, project_name, location, station_id, station_area_id, return_due_date, contract_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [recipient, type, note, project_name || null, officialLocation, station_id || null, station_area_id || null, return_due_date || null, contract_id || null]);

      const newWithdrawalId = rows[0].id;

      for (const item of items) {
        // Atomically check-and-decrement in one statement so two concurrent
        // withdrawals of the same low-stock item can't both pass a stale
        // read and drive quantity negative.
        const { rows: decRows } = await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
           WHERE id = $2 AND quantity >= $1
           RETURNING name, quantity, min_stock`,
          [item.quantity, item.inventory_id]
        );
        if (decRows.length === 0) {
          const { rows: nameRows } = await client.query('SELECT name FROM inventory WHERE id = $1', [item.inventory_id]);
          const err = new Error(nameRows[0] ? `อุปกรณ์ "${nameRows[0].name}" คงเหลือไม่เพียงพอ` : 'ไม่พบข้อมูลอุปกรณ์บางรายการ');
          err.status = 400;
          throw err;
        }
        const invCheck = decRows[0];

        // Insert withdrawal item with comma-separated serial numbers
        const serialNumbersStr = (item.serial_numbers && item.serial_numbers.length > 0)
          ? item.serial_numbers.filter(sn => sn.trim() !== '').join(', ')
          : null;

        await client.query(`
          INSERT INTO withdrawal_items (withdrawal_id, inventory_id, quantity, serial_numbers)
          VALUES ($1, $2, $3, $4)
        `, [newWithdrawalId, item.inventory_id, item.quantity, serialNumbersStr]);

        // Check if stock is now below min_stock
        if (invCheck.quantity < invCheck.min_stock) {
          const stockAlertMsg = `\n⚠️ *อุปกรณ์ต่ำกว่าเกณฑ์ขั้นต่ำ!*\nพัสดุ: ${invCheck.name}\nคงเหลือ: ${invCheck.quantity} ชิ้น (เกณฑ์ขั้นต่ำ: ${invCheck.min_stock} ชิ้น)`;
          sendLineNotify('stock', stockAlertMsg);
        }

        const providedSns = (item.serial_numbers || []).filter(sn => sn.trim() !== '');

        if (providedSns.length > 0) {
          for (const sn of providedSns) {
            const { rows: snRows } = await client.query('SELECT id, inventory_id FROM inventory_instances WHERE serial_number = $1', [sn]);
            const row = snRows[0];

            if (row && row.inventory_id !== item.inventory_id) {
              const err = new Error(`หมายเลขเครื่อง S/N '${sn}' ถูกใช้งานไปแล้วกับอุปกรณ์ประเภทอื่น`);
              err.status = 400;
              throw err;
            }

            let instanceId;
            if (row) {
              instanceId = row.id;
              await client.query(`UPDATE inventory_instances SET status = 'Withdrawn', current_location = $1, station_id = $2, contract_id = $3, updated_at = NOW() WHERE id = $4`,
                [officialLocation || project_name || 'Withdrawn', station_id || null, contract_id || null, instanceId]);
            } else {
              const { rows: newInst } = await client.query(`INSERT INTO inventory_instances (inventory_id, serial_number, status, current_location, station_id, contract_id) VALUES ($1, $2, 'Withdrawn', $3, $4, $5) RETURNING id`,
                [item.inventory_id, sn, officialLocation || project_name || 'Withdrawn', station_id || null, contract_id || null]);
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
          const remainingQty = item.quantity - providedSns.length;
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
            quantity_withdrawn: item.quantity,
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
    console.error('Create Withdrawal Error:', err);
    // NewWithdrawal.tsx reads `.response.data.message` — keep that field for both
    // validation errors (400, e.g. insufficient stock) and unexpected 500s.
    res.status(err.status || 500).json({ message: err.message });
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
        'SELECT wi.*, w.recipient, w.project_name, w.location, w.station_id, w.contract_id, w.note FROM withdrawal_items wi JOIN withdrawals w ON wi.withdrawal_id = w.id WHERE wi.id = $1 AND wi.withdrawal_id = $2',
        [itemId, id]
      );
      const item = rows[0];
      if (!item) {
        const err = new Error('ไม่พบรายการเบิกที่ต้องการแก้ไข');
        err.status = 404;
        throw err;
      }

      const existingSns = item.serial_numbers ? item.serial_numbers.split(', ').filter(s => s.trim() !== '') : [];
      const newSns = serial_numbers.filter(sn => sn.trim() !== '' && !existingSns.includes(sn));

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
        const { rows: snRows } = await client.query('SELECT id, inventory_id FROM inventory_instances WHERE serial_number = $1', [sn]);
        const row = snRows[0];

        if (row && row.inventory_id !== item.inventory_id) {
          const err = new Error(`หมายเลขเครื่อง S/N '${sn}' ถูกใช้งานไปแล้วกับอุปกรณ์ประเภทอื่น`);
          err.status = 400;
          throw err;
        }

        let instanceId;
        if (row) {
          instanceId = row.id;
          await client.query(`UPDATE inventory_instances SET status = 'Withdrawn', current_location = $1, station_id = $2, contract_id = $3, updated_at = NOW() WHERE id = $4`,
            [item.location || item.project_name || 'Withdrawn', item.station_id || null, item.contract_id || null, instanceId]);
        } else {
          const { rows: newInst } = await client.query(`INSERT INTO inventory_instances (inventory_id, serial_number, status, current_location, station_id, contract_id) VALUES ($1, $2, 'Withdrawn', $3, $4, $5) RETURNING id`,
            [item.inventory_id, sn, item.location || item.project_name || 'Withdrawn', item.station_id || null, item.contract_id || null]);
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
      }

      return { item, updatedSnsStr, newSnsLength: newSns.length };
    });

    if (newSnsLength === 0) {
      return res.json({ message: 'อัปเดตเรียบร้อย (ไม่มี S/N ใหม่)' });
    }

    logAudit('withdrawal', id, 'withdrawal update', item, { ...item, serial_numbers: updatedSnsStr }, item.recipient || 'System/Admin').catch(e => console.error(e));
    res.json({ message: 'ระบุ Serial Numbers ย้อนหลังเรียบร้อยแล้ว' });
  } catch (err) {
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

  try {
    await withTransaction(async (client) => {
      // 1. Get items to return to stock
      const { rows: items } = await client.query('SELECT inventory_id, quantity FROM withdrawal_items WHERE withdrawal_id = $1', [id]);

      // 2. Return each item to inventory
      for (const item of items) {
        await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.inventory_id]);
      }

      // 3. Delete the withdrawal (cascade will handle withdrawal_items)
      await client.query('DELETE FROM withdrawals WHERE id = $1', [id]);
      await client.query('DELETE FROM inventory_transactions WHERE withdrawal_id = $1', [id]);
    });

    res.json({ message: 'ยกเลิกการเบิกและคืนสต็อกเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
