const { query: dbQuery, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const { INSTANCE_STATUS } = require('../utils/constants');
const { badRequest, requirePositiveInteger } = require('../utils/stockValidation');

// Helper to log a transaction. Accepts an optional `executor` (a pg Pool or a
// checked-out transaction client) so callers running inside withTransaction()
// can pass their client and have this insert participate in the same transaction.
const logTransaction = async (data, executor = { query: dbQuery }) => {
  const {
    inventory_id,
    instance_id = null,
    transaction_type,
    quantity_added = 0,
    quantity_withdrawn = 0,
    quantity_borrowed = 0,
    quantity_returned = 0,
    project_name = null,
    location = null,
    station_id = null,
    contract_id = null,
    user_name = null,
    note = null,
    withdrawal_id = null,
    return_image = null
  } = data;

  let resolvedLocation = location;
  if (station_id && !location) {
    const { rows } = await executor.query('SELECT name FROM stations WHERE id = $1', [station_id]);
    resolvedLocation = rows[0] ? rows[0].name : null;
  }

  const { rows } = await executor.query(`
    INSERT INTO inventory_transactions (
      inventory_id, instance_id, transaction_type,
      quantity_added, quantity_withdrawn, quantity_borrowed, quantity_returned,
      project_name, location, station_id, contract_id, user_name, note, withdrawal_id, return_image
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id
  `, [
    inventory_id, instance_id, transaction_type,
    quantity_added, quantity_withdrawn, quantity_borrowed, quantity_returned,
    project_name, resolvedLocation, station_id, contract_id, user_name, note, withdrawal_id, return_image
  ]);

  const newId = rows[0].id;
  logAudit('inventory_transaction', newId, 'inventory movement', null, data, user_name || 'System').catch(e => console.error(e));
  return newId;
};

exports.getAllTransactions = async (req, res) => {
  try {
    const { inventory_id, station_id, withdrawal_id, pending_only } = req.query;
    let sql = `SELECT * FROM transactions_view`;
    const params = [];
    let conditions = [];
    if (inventory_id) {
      params.push(inventory_id);
      conditions.push(`inventory_id = $${params.length}`);
    }
    if (station_id) {
      params.push(station_id);
      conditions.push(`station_id = $${params.length}`);
    }
    if (withdrawal_id) {
      params.push(withdrawal_id);
      conditions.push(`withdrawal_id = $${params.length}`);
    }
    if (pending_only === 'true') {
      conditions.push(`(status IS NULL OR status != 'RETURNED') AND (transaction_type = 'BORROW' OR (transaction_type = 'WITHDRAW' AND withdrawal_type IN ('ทดสอบ', 'สำรองใช้งาน', 'ยืมใช้งาน', 'ยืม')))`);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
    sql += ` ORDER BY created_at DESC, id DESC`;

    const { rows } = await dbQuery(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.returnItem = async (req, res) => {
  const { inventory_id, instance_id, quantity, condition, note, transaction_id } = req.body;
  const user_name = req.user.full_name;
  const return_image = req.file ? req.file.filename : null;

  let returnQuantity;
  try {
    returnQuantity = requirePositiveInteger(quantity, 'จำนวนคืน');
    if (!inventory_id) throw badRequest('กรุณาระบุอุปกรณ์ที่คืน');
    if (!transaction_id) throw badRequest('กรุณาระบุรายการเบิก/ยืมต้นทาง');
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  try {
    await withTransaction(async (client) => {
      let withdrawal_id = null;
      let original_station_id = null;
      let original_project_name = null;
      let original_location = null;
      let original_instance_id = instance_id || null;
      let source_withdrawal_id = null;
      let sourceLot = null;

      // 1. Lock and validate the exact source transaction. Never trust the
      // inventory/instance identifiers supplied separately by the client.
      const { rows: sourceRows } = await client.query(`
        SELECT id, inventory_id, withdrawal_id, station_id, project_name, location,
               instance_id, status, transaction_type,
               quantity_borrowed, quantity_withdrawn
        FROM inventory_transactions
        WHERE id = $1
        FOR UPDATE
      `, [transaction_id]);
      const sourceTransaction = sourceRows[0];
      if (!sourceTransaction || !['BORROW', 'WITHDRAW'].includes(sourceTransaction.transaction_type)) {
        const err = new Error('ไม่พบรายการเบิก/ยืมต้นทางที่สามารถคืนได้');
        err.status = 404;
        throw err;
      }
      if (sourceTransaction.status === 'RETURNED') {
        const err = new Error('รายการนี้ถูกคืนเข้าคลังไปแล้ว');
        err.status = 409;
        throw err;
      }
      if (Number(sourceTransaction.inventory_id) !== Number(inventory_id)) {
        throw badRequest('อุปกรณ์ที่คืนไม่ตรงกับรายการต้นทาง');
      }
      if (instance_id && sourceTransaction.instance_id && Number(sourceTransaction.instance_id) !== Number(instance_id)) {
        throw badRequest('S/N ที่คืนไม่ตรงกับรายการต้นทาง');
      }

      const sourceQuantity = Number(sourceTransaction.quantity_borrowed || sourceTransaction.quantity_withdrawn || 0);
      if (returnQuantity !== sourceQuantity) {
        throw badRequest(`ต้องคืนเต็มจำนวนของรายการนี้ (${sourceQuantity} ชิ้น)`);
      }

      withdrawal_id = sourceTransaction.withdrawal_id;
      original_station_id = sourceTransaction.station_id;
      original_project_name = sourceTransaction.project_name;
      original_location = sourceTransaction.location;
      original_instance_id = sourceTransaction.instance_id || original_instance_id;

      await client.query(
        `UPDATE inventory_transactions SET status = 'RETURNED' WHERE id = $1`,
        [transaction_id]
      );

      if (original_instance_id) {
        const { rows: instanceRows } = await client.query(`
          SELECT id, inventory_id, station_id, status, current_location,
                 source_withdrawal_id, project_name_snapshot,
                 contract_id, contract_no_snapshot, contract_name_snapshot, contract_year_snapshot
          FROM inventory_instances WHERE id = $1
          FOR UPDATE
        `, [original_instance_id]);
        const instance = instanceRows[0];
        if (!instance || Number(instance.inventory_id) !== Number(inventory_id)) {
          throw badRequest('S/N ที่คืนไม่ตรงกับอุปกรณ์');
        }
        if (instance.status !== INSTANCE_STATUS.WITHDRAWN || instance.station_id == null) {
          const err = new Error('S/N นี้ไม่ได้อยู่ในสถานะติดตั้งที่สามารถคืนได้');
          err.status = 409;
          throw err;
        }
        original_station_id = instance.station_id;
        original_location = instance.current_location || original_location;
        source_withdrawal_id = instance.source_withdrawal_id;
        original_project_name = original_project_name || instance.project_name_snapshot;
      }

      if (original_station_id && (withdrawal_id || source_withdrawal_id)) {
        const sourceId = withdrawal_id || source_withdrawal_id;
        const { rows: lotRows } = await client.query(`
          SELECT * FROM station_inventory_lots
          WHERE station_id = $1 AND inventory_id = $2 AND withdrawal_id = $3
            AND quantity_remaining > 0
          ORDER BY id ASC
          LIMIT 1
          FOR UPDATE
        `, [original_station_id, inventory_id, sourceId]);
        sourceLot = lotRows[0] || null;
      }

      // 2. Update inventory
      const inventoryUpdate = await client.query(
        'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING id',
        [returnQuantity, inventory_id]
      );
      if (inventoryUpdate.rowCount !== 1) throw badRequest('ไม่พบอุปกรณ์ที่คืน');

      // 3. Update instance status if provided
      if (original_instance_id) {
        await client.query(
          `UPDATE inventory_instances
           SET status = $1, condition = $2, current_location = 'Warehouse', station_id = NULL, updated_at = NOW()
           WHERE id = $3`,
          [INSTANCE_STATUS.IN_STOCK, condition || 'Good', original_instance_id]
        );
      }

      if (original_station_id) {
        const stationUpdate = await client.query(`
          UPDATE station_inventory
          SET quantity = quantity - $1, updated_at = NOW()
          WHERE station_id = $2 AND inventory_id = $3 AND quantity >= $1
          RETURNING quantity
        `, [returnQuantity, original_station_id, inventory_id]);
        if (stationUpdate.rowCount !== 1) {
          const err = new Error('ยอดอุปกรณ์ที่สถานีไม่เพียงพอสำหรับการคืน กรุณาตรวจสอบข้อมูลก่อน');
          err.status = 409;
          throw err;
        }
        await client.query(`
          DELETE FROM station_inventory
          WHERE station_id = $1 AND inventory_id = $2 AND quantity = 0
        `, [original_station_id, inventory_id]);

        if (!sourceLot) {
          const err = new Error('ไม่พบ lot ต้นทางของอุปกรณ์ที่คืน');
          err.status = 409;
          throw err;
        }
        if (sourceLot) {
          const lotUpdate = await client.query(`
            UPDATE station_inventory_lots
            SET quantity_remaining = quantity_remaining - $1,
                untracked_remaining = untracked_remaining - $2,
                updated_at = NOW()
            WHERE id = $3
              AND quantity_remaining >= $1
              AND untracked_remaining >= $2
            RETURNING id
          `, [returnQuantity, original_instance_id ? 0 : returnQuantity, sourceLot.id]);
          if (lotUpdate.rowCount !== 1) {
            const err = new Error('ยอด lot ต้นทางไม่เพียงพอสำหรับการคืน');
            err.status = 409;
            throw err;
          }
        }

        await client.query(`
          INSERT INTO station_asset_events (
            station_id, inventory_id, instance_id, event_type, event_at, quantity,
            source_withdrawal_id, project_name_snapshot, contract_id,
            contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
            note, performed_by
          )
          VALUES ($1, $2, $3, 'RETURN_TO_WAREHOUSE', NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          original_station_id, inventory_id, original_instance_id, returnQuantity,
          withdrawal_id || source_withdrawal_id || null, original_project_name || null,
          sourceLot?.contract_id || null, sourceLot?.contract_no_snapshot || null,
          sourceLot?.contract_name_snapshot || null, sourceLot?.contract_year_snapshot || null,
          note || null, user_name
        ]);
      }

      // 4. Log transaction (inherit station_id/project from original so it appears in station history)
      await logTransaction({
        inventory_id, instance_id: original_instance_id || null, transaction_type: 'RETURN',
        quantity_returned: returnQuantity, user_name, note: note || (original_instance_id ? `Returned in ${condition} condition` : undefined),
        withdrawal_id, return_image,
        station_id: original_station_id,
        project_name: original_project_name,
        location: original_location
      }, client);
    });

    res.json({ message: 'บันทึกการคืนเรียบร้อย' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getLatestTransaction = async (req, res) => {
  try {
    const { rows } = await dbQuery(`
      SELECT t.id, t.transaction_type, t.quantity_added, t.quantity_withdrawn, t.quantity_borrowed, t.quantity_returned,
             i.name as product_name, t.user_name
      FROM inventory_transactions t
      JOIN inventory i ON t.inventory_id = i.id
      ORDER BY t.id DESC LIMIT 1
    `);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await dbQuery('DELETE FROM inventory_transactions WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบรายการที่ต้องการลบ' });
    res.json({ message: 'ลบรายการเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.logTransaction = logTransaction; // Export for use in other controllers
