const { query } = require('../database/db');
const { verify } = require('../utils/jwt');

const isPublicApiMode = () => (
  process.env.NODE_ENV !== 'test'
  && /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_API_MODE || '').trim())
);

const isReadOnlyIpBypassEnabled = () => (
  /^(1|true|yes|on)$/i.test(String(process.env.READ_ONLY_IP_BYPASS || '').trim())
);

const normalizeIp = (value) => {
  const ip = String(value || '').trim().toLowerCase();
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
};

const getDirectRemoteAddress = (req) => (
  req?.socket?.remoteAddress || req?.connection?.remoteAddress || ''
);

const getReadOnlyIpAllowlist = () => new Set(
  String(process.env.READ_ONLY_IPS || '')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean)
);

/**
 * Temporary, read-only test access for a directly connected LAN client.
 * Deliberately ignores req.ip and forwarded headers so an arbitrary client
 * cannot claim an allowed address through X-Forwarded-For.
 */
const isReadOnlyIpBypassRequest = (req) => (
  isReadOnlyIpBypassEnabled()
  && req?.method === 'GET'
  && getReadOnlyIpAllowlist().has(normalizeIp(getDirectRemoteAddress(req)))
);

// Public API requests still receive an actor so existing controllers and audit
// logging can continue to work without inventing a real user account.
const PUBLIC_API_USER = Object.freeze({
  id: null,
  username: 'public-api',
  full_name: 'Public API',
  is_full: true,
  is_public: true,
  permissions: {},
});

const READ_ONLY_IP_TEST_USER = Object.freeze({
  id: null,
  username: 'read-only-ip-test',
  full_name: 'Read-only IP Test',
  is_full: false,
  is_public: true,
  permissions: {},
});

/**
 * Verifies the JWT in Authorization header, re-fetches the user from DB
 * (so disabled accounts + permission changes take effect immediately),
 * and attaches req.user.
 */
exports.requireAuth = async (req, res, next) => {
  if (isPublicApiMode()) {
    req.user = PUBLIC_API_USER;
    return next();
  }

  if (isReadOnlyIpBypassRequest(req)) {
    req.user = READ_ONLY_IP_TEST_USER;
    return next();
  }

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
  if (isPublicApiMode()) return true;
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
  if (isPublicApiMode()) return next();
  if (!hasPermission(req.user, key)) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' });
  }
  next();
};

exports.requireFull = (req, res, next) => {
  if (isPublicApiMode()) return next();
  if (!req.user || !req.user.is_full) {
    return res.status(403).json({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบ (User Full)' });
  }
  next();
};

// Sensitive stock adjustments must always come from a real authenticated
// administrator. The public API actor is intentionally not accepted here.
exports.requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_full || req.user.is_public) {
    return res.status(403).json({ error: 'ต้องใช้สิทธิ์ผู้ดูแลระบบ (Admin) เพื่อปรับยอดคงเหลือ' });
  }
  next();
};

exports.isPublicApiMode = isPublicApiMode;
exports.isReadOnlyIpBypassRequest = isReadOnlyIpBypassRequest;
exports.normalizeIp = normalizeIp;
