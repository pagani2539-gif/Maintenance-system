const { query } = require('../database/db');

const notFound = (message) => {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  return error;
};

// Legacy update handlers predate PATCH semantics and expect every editable
// column. This adapter fills omitted fields from the current row while
// preserving explicit null values from the v2 request.
exports.mergeBodyFromRow = (table, fields) => async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${fields.join(', ')} FROM ${table} WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound('ไม่พบข้อมูลที่ต้องการแก้ไข');
    req.body = fields.reduce((body, field) => ({
      ...body,
      [field]: Object.prototype.hasOwnProperty.call(body, field) ? body[field] : rows[0][field],
    }), req.body || {});
    return next();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.getInventoryById = async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('ไม่พบอุปกรณ์');
    return res.json(rows[0]);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.getContractById = async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('ไม่พบสัญญา');
    return res.json(rows[0]);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.getTechnicianById = async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM technicians WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('ไม่พบข้อมูลช่าง');
    return res.json(rows[0]);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, username, full_name, is_full, permissions,
              force_password_change, is_active, last_login, created_by, created_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row) throw notFound('ไม่พบผู้ใช้');
    return res.json({
      ...row,
      is_full: row.is_full === 1,
      force_password_change: row.force_password_change === 1,
      is_active: row.is_active === 1,
      permissions: row.permissions || {},
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};
