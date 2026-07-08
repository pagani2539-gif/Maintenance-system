const { query } = require('../database/db');
const { verify } = require('../utils/jwt');

/**
 * Verifies the JWT in Authorization header, re-fetches the user from DB
 * (so disabled accounts + permission changes take effect immediately),
 * and attaches req.user.
 */
exports.requireAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ไม่ได้รับ token หรือรูปแบบไม่ถูกต้อง' });
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verify(token);
  } catch {
    return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }

  try {
    const { rows } = await query(
      `SELECT id, username, full_name, is_full, permissions, is_active, password_changed_at
       FROM users WHERE id = $1`,
      [payload.userId]
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });
    if (!row.is_active) return res.status(401).json({ error: 'บัญชีถูกระงับการใช้งาน' });

    // Reject tokens issued before the latest password change.
    // JWT `iat` only has second-level precision, but Postgres TIMESTAMPTZ
    // has microsecond precision — floor to the second so a password change
    // and a token issued in the same second don't spuriously fail this check
    // (this raced under Postgres even though it never did under SQLite's
    // second-precision CURRENT_TIMESTAMP).
    const iatMs = (payload.iat || 0) * 1000;
    const pwdChangedMs = row.password_changed_at ? Math.floor(new Date(row.password_changed_at).getTime() / 1000) * 1000 : 0;
    if (iatMs && pwdChangedMs && iatMs < pwdChangedMs) {
      return res.status(401).json({ error: 'Token หมดอายุเนื่องจากมีการเปลี่ยนรหัสผ่าน' });
    }

    // permissions is JSONB — pg already parses it into a JS object, no JSON.parse needed
    req.user = {
      id: row.id,
      username: row.username,
      full_name: row.full_name,
      is_full: row.is_full === 1,
      permissions: row.permissions || {},
    };
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Walks a dot-key (e.g. "delete.repairs") through the permissions JSON.
 * is_full bypasses all checks.
 */
const hasPermission = (user, key) => {
  if (!user) return false;
  if (user.is_full) return true;
  const parts = key.split('.');
  let node = user.permissions || {};
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return false;
    node = node[p];
  }
  return node === true;
};

exports.hasPermission = hasPermission;

exports.requirePermission = (key) => (req, res, next) => {
  if (!hasPermission(req.user, key)) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' });
  }
  next();
};

exports.requireFull = (req, res, next) => {
  if (!req.user || !req.user.is_full) {
    return res.status(403).json({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบ (User Full)' });
  }
  next();
};
