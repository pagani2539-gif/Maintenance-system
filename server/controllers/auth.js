const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const { sign } = require('../utils/jwt');

const PASSWORD_MIN_LEN = 8;

const sanitizeUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    is_full: row.is_full === 1,
    permissions: row.permissions || {},
    force_password_change: row.force_password_change === 1,
    is_active: row.is_active === 1,
    last_login: row.last_login,
  };
};

exports.login = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน' });
  }

  try {
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    if (!row.is_active) return res.status(401).json({ error: 'บัญชีถูกระงับการใช้งาน' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const token = sign({ userId: row.id });
    query('UPDATE users SET last_login = NOW() WHERE id = $1', [row.id]).catch((err) => {
      console.error('Failed to update last_login:', err.message);
    });

    res.json({
      token,
      user: sanitizeUser(row),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, username, full_name, is_full, permissions, force_password_change, is_active, last_login
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ไม่พบบัญชี' });
    res.json({ user: sanitizeUser(row) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสผ่านปัจจุบันและรหัสผ่านใหม่' });
  }
  if (new_password.length < PASSWORD_MIN_LEN) {
    return res.status(400).json({ error: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${PASSWORD_MIN_LEN} ตัวอักษร` });
  }

  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ไม่พบบัญชี' });

    const ok = await bcrypt.compare(current_password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });

    const hash = await bcrypt.hash(new_password, 10);

    await query(
      `UPDATE users SET password_hash = $1, force_password_change = 0,
       password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [hash, req.user.id]
    );

    // Issue a fresh token so the client can continue immediately
    const token = sign({ userId: req.user.id });
    res.json({ message: 'เปลี่ยนรหัสผ่านเรียบร้อย', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
