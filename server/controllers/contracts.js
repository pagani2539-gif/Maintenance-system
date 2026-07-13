const { query } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

exports.getAllContracts = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT c.*, co.name_th as company_name
      FROM contracts c
      LEFT JOIN companies co ON c.company_id = co.id
    `;
    const params = [];
    if (status !== undefined) {
      sql += ` WHERE c.status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY c.year_be DESC, c.contract_no ASC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get Contracts Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.createContract = async (req, res) => {
  const { contract_no, name, year_be, company_id, start_date, end_date, note } = req.body;

  if (!contract_no || !name || !year_be) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน (เลขที่สัญญา, ชื่อสัญญา, ปี พ.ศ.)' });
  }

  try {
    const { rows } = await query(`
      INSERT INTO contracts (contract_no, name, year_be, company_id, start_date, end_date, note)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [contract_no.trim(), name.trim(), year_be, company_id || null, start_date || null, end_date || null, note || null]);

    const row = rows[0];
    logAudit('contract', row.id, 'create', null, row, req.user?.full_name || 'System/Admin').catch(e => console.error(e));
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'เลขที่สัญญานี้มีอยู่แล้วในระบบ' });
    }
    console.error('Create Contract Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateContract = async (req, res) => {
  const { id } = req.params;
  const { contract_no, name, year_be, company_id, start_date, end_date, note } = req.body;

  if (!contract_no || !name || !year_be) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน (เลขที่สัญญา, ชื่อสัญญา, ปี พ.ศ.)' });
  }

  try {
    const { rows: oldRows } = await query('SELECT * FROM contracts WHERE id = $1', [id]);
    const oldContract = oldRows[0];
    if (!oldContract) return res.status(404).json({ error: 'ไม่พบสัญญาที่ต้องการแก้ไข' });

    // A contract is historical reference data once it has been used by a
    // withdrawal/asset/transaction. Changing its identity would silently
    // rewrite the meaning of old records, so create a new contract instead.
    const { rows: usageRows } = await query(`
      SELECT EXISTS (SELECT 1 FROM withdrawals WHERE contract_id = $1) AS withdrawal_used,
             EXISTS (SELECT 1 FROM inventory_instances WHERE contract_id = $1) AS asset_used,
             EXISTS (SELECT 1 FROM inventory_transactions WHERE contract_id = $1) AS transaction_used
    `, [id]);
    const usage = usageRows[0] || {};
    const identityChanged = [
      ['contract_no', contract_no],
      ['name', name],
      ['year_be', year_be],
      ['company_id', company_id || null],
      ['start_date', start_date || null],
      ['end_date', end_date || null]
    ].some(([key, value]) => String(oldContract[key] ?? '') !== String(value ?? ''));

    if (identityChanged && (usage.withdrawal_used || usage.asset_used || usage.transaction_used)) {
      return res.status(409).json({
        error: 'สัญญานี้ถูกใช้อ้างอิงในประวัติแล้ว ไม่สามารถแก้เลขที่สัญญา ชื่อ ปี หรือช่วงเวลาได้ กรุณาสร้างสัญญาฉบับใหม่แทน'
      });
    }

    const { rows } = await query(`
      UPDATE contracts
      SET contract_no = $1, name = $2, year_be = $3, company_id = $4, start_date = $5, end_date = $6, note = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [contract_no.trim(), name.trim(), year_be, company_id || null, start_date || null, end_date || null, note || null, id]);

    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ไม่พบสัญญาที่ต้องการแก้ไข' });

    logAudit('contract', id, 'update', oldContract, row, req.user?.full_name || 'System/Admin').catch(e => console.error(e));
    res.json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'เลขที่สัญญานี้มีอยู่แล้วในระบบ' });
    }
    console.error('Update Contract Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteContract = async (req, res) => {
  const { id } = req.params;
  const deleted_by = req.user?.full_name || 'System/Admin';

  try {
    const { rows: oldRows } = await query('SELECT * FROM contracts WHERE id = $1', [id]);
    const oldContract = oldRows[0];
    if (!oldContract) return res.status(404).json({ error: 'ไม่พบสัญญาที่ต้องการลบ' });

    const { rows } = await query(`
      UPDATE contracts
      SET status = 0, deleted_at = NOW(), deleted_by = $1
      WHERE id = $2
      RETURNING *
    `, [deleted_by, id]);

    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบสัญญาที่ต้องการลบ' });

    logAudit('contract', id, 'deactivate', oldContract, { ...oldContract, status: 0, deleted_at: new Date().toISOString() }, deleted_by).catch(e => console.error(e));
    res.json({ message: 'ปิดใช้งานสัญญาเรียบร้อยแล้ว (Soft Delete)' });
  } catch (err) {
    console.error('Delete Contract Error:', err);
    res.status(500).json({ error: err.message });
  }
};
