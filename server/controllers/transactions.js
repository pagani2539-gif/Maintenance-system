const { query: dbQuery, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

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

  try {
    await withTransaction(async (client) => {
      let withdrawal_id = null;
      let original_station_id = null;
      let original_project_name = null;
      let original_location = null;

      // 1. If transaction_id provided, mark original as RETURNED
      if (transaction_id) {
        const { rows } = await client.query(
          'SELECT withdrawal_id, station_id, project_name, location FROM inventory_transactions WHERE id = $1',
          [transaction_id]
        );
        const row = rows[0];
        if (row) {
          withdrawal_id = row.withdrawal_id;
          original_station_id = row.station_id;
          original_project_name = row.project_name;
          original_location = row.location;
        }
        await client.query(
          `UPDATE inventory_transactions SET status = 'RETURNED' WHERE id = $1 AND transaction_type IN ('BORROW', 'WITHDRAW')`,
          [transaction_id]
        );
      }

      // 2. Update inventory
      await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [quantity, inventory_id]);

      // 3. Update instance status if provided
      if (instance_id) {
        await client.query(
          `UPDATE inventory_instances SET status = 'In Stock', condition = $1, current_location = 'Warehouse', station_id = NULL WHERE id = $2`,
          [condition || 'Good', instance_id]
        );
      }

      // 4. Log transaction (inherit station_id/project from original so it appears in station history)
      await logTransaction({
        inventory_id, instance_id: instance_id || null, transaction_type: 'RETURN',
        quantity_returned: quantity, user_name, note: note || (instance_id ? `Returned in ${condition} condition` : undefined),
        withdrawal_id, return_image,
        station_id: original_station_id,
        project_name: original_project_name,
        location: original_location
      }, client);
    });

    res.json({ message: 'บันทึกการคืนเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
