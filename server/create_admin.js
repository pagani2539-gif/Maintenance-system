const bcrypt = require('bcryptjs');
const { query } = require('./database/db');

(async () => {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Set SEED_ADMIN_PASSWORD to a value with at least 12 characters before running this script.');
  }
  const hash = await bcrypt.hash(password, 10);
  const sql = `INSERT INTO users (username, password_hash, full_name, is_full, permissions, force_password_change, is_active)
    VALUES ($1, $2, $3, 1, '{}', 1, 1)
    ON CONFLICT (username) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name,
      is_full = EXCLUDED.is_full,
      permissions = EXCLUDED.permissions,
      force_password_change = EXCLUDED.force_password_change,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING id`;

  const res = await query(sql, [username, hash, 'Administrator']);
  console.log('admin id', res.rows[0]?.id);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
