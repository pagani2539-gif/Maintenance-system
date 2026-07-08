const { query } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

// Roster of technicians who carry a personal spare-parts kit. Kept separate
// from `users` because many field techs have no login; `user_id` links the
// two when an account exists. See migrations-pg/015_technician_stock.js.

exports.getAllTechnicians = async (req, res) => {
  try {
    const { active } = req.query;
    let sql = `
      SELECT t.id, t.user_id, t.full_name, t.code, t.phone, t.is_active,
             t.created_at, t.updated_at,
             u.username AS user_username,
             (SELECT COUNT(*) FROM technician_holdings_view h
                WHERE h.technician_id = t.id AND h.on_hand_qty > 0) AS item_count
      FROM technicians t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    const params = [];
    if (active === 'true') sql += ` WHERE t.is_active = 1`;
    sql += ` ORDER BY t.is_active DESC, t.full_name ASC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTechnician = async (req, res) => {
  const { full_name, code, phone, user_id } = req.body;
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อช่าง' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO technicians (full_name, code, phone, user_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [full_name.trim(), code || null, phone || null, user_id || null]
    );
    const id = rows[0].id;
    logAudit('technician', id, 'create', null, { full_name, code, phone, user_id }, req.user.full_name).catch(e => console.error(e));
    res.status(201).json({ id, message: 'เพิ่มช่างเรียบร้อย' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'มีชื่อช่างหรือรหัสนี้อยู่แล้ว' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.updateTechnician = async (req, res) => {
  const { id } = req.params;
  const { full_name, code, phone, user_id, is_active } = req.body;
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อช่าง' });
  }
  try {
    const { rows: oldRows } = await query('SELECT * FROM technicians WHERE id = $1', [id]);
    const oldTech = oldRows[0];
    if (!oldTech) return res.status(404).json({ error: 'ไม่พบข้อมูลช่าง' });

    await query(
      `UPDATE technicians
       SET full_name = $1, code = $2, phone = $3, user_id = $4,
           is_active = $5, updated_at = NOW()
       WHERE id = $6`,
      [full_name.trim(), code || null, phone || null, user_id || null,
       is_active === undefined ? oldTech.is_active : (is_active ? 1 : 0), id]
    );
    logAudit('technician', id, 'update', oldTech, req.body, req.user.full_name).catch(e => console.error(e));
    res.json({ message: 'อัปเดตข้อมูลช่างเรียบร้อย' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'มีชื่อช่างหรือรหัสนี้อยู่แล้ว' });
    }
    res.status(500).json({ error: err.message });
  }
};
