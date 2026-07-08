const bcrypt = require('bcryptjs');
const { query } = require('../database/db');

const sanitize = (row) => {
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
    created_by: row.created_by,
    created_at: row.created_at,
  };
};

exports.list = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, username, full_name, is_full, permissions, force_password_change, is_active, last_login, created_by, created_at
       FROM users ORDER BY is_full DESC, id ASC`
    );
    res.json((rows || []).map(sanitize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  const { username, password, full_name, is_full, permissions, force_password_change } = req.body || {};
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'กรุณาระบุ username, password และชื่อ-สกุล' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  const trimmedUsername = String(username).trim();
  const permissionsJson = JSON.stringify(permissions && typeof permissions === 'object' ? permissions : {});

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, permissions, force_password_change, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        trimmedUsername,
        hash,
        full_name.trim(),
        is_full ? 1 : 0,
        permissionsJson,
        force_password_change ? 1 : 0,
        req.user.id,
      ]
    );
    res.status(201).json({ id: rows[0].id, message: 'สร้างผู้ใช้เรียบร้อย' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id, 10);
  const { full_name, password, is_full, permissions, is_active } = req.body || {};

  try {
    const { rows: targetRows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    // Self-protection
    const isSelf = req.user.id === userId;
    const wantsToggleFull = is_full !== undefined && (is_full ? 1 : 0) !== target.is_full;
    const wantsDeactivate = is_active === false || is_active === 0;

    if (isSelf && wantsToggleFull) {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสิทธิ์ผู้ดูแลของบัญชีตัวเองได้' });
    }
    if (isSelf && wantsDeactivate) {
      return res.status(400).json({ error: 'ไม่สามารถปิดบัญชีตัวเองได้' });
    }

    // Prevent removing the last Full user
    if (wantsToggleFull && target.is_full === 1 && !is_full) {
      const { rows: cntRows } = await query('SELECT COUNT(*) as cnt FROM users WHERE is_full = 1 AND is_active = 1');
      if (Number(cntRows[0].cnt) <= 1) {
        return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบ (Full) อย่างน้อย 1 คน' });
      }
    }

    const fields = [];
    const params = [];
    let idx = 1;

    if (full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      params.push(String(full_name).trim());
    }
    if (is_full !== undefined) {
      fields.push(`is_full = $${idx++}`);
      params.push(is_full ? 1 : 0);
    }
    if (permissions !== undefined) {
      fields.push(`permissions = $${idx++}`);
      params.push(JSON.stringify(permissions && typeof permissions === 'object' ? permissions : {}));
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      params.push(is_active ? 1 : 0);
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      }
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password_hash = $${idx++}`, `password_changed_at = NOW()`, `force_password_change = 0`);
      params.push(hash);
    }

    if (fields.length === 0) return res.json({ message: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
    fields.push('updated_at = NOW()');
    params.push(userId);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ message: 'บันทึกข้อมูลผู้ใช้เรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Soft-delete: set is_active = 0 (preserves history)
exports.remove = async (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id, 10);

  if (req.user.id === userId) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
  }

  try {
    const { rows } = await query('SELECT is_full FROM users WHERE id = $1', [userId]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    if (row.is_full) {
      const { rows: cntRows } = await query('SELECT COUNT(*) as cnt FROM users WHERE is_full = 1 AND is_active = 1');
      if (Number(cntRows[0].cnt) <= 1) {
        return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบ (Full) อย่างน้อย 1 คน' });
      }
    }

    await query(`UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = $1`, [userId]);
    res.json({ message: 'ปิดการใช้งานบัญชีเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;
  const search = req.query.search;

  try {
    let sql = 'SELECT * FROM audit_logs';
    const params = [];

    if (search) {
      sql += ' WHERE entity_type ILIKE $1 OR action ILIKE $1 OR user_name ILIKE $1';
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);

    let countSql = 'SELECT COUNT(*) as count FROM audit_logs';
    const countParams = [];
    if (search) {
      countSql += ' WHERE entity_type ILIKE $1 OR action ILIKE $1 OR user_name ILIKE $1';
      countParams.push(`%${search}%`);
    }

    const { rows: countRows } = await query(countSql, countParams);
    res.json({
      logs: rows || [],
      total: countRows[0] ? Number(countRows[0].count) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
