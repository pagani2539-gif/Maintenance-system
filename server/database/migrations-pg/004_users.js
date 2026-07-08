module.exports = {
  name: '004_users',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        is_full INTEGER NOT NULL DEFAULT 0,
        permissions JSONB NOT NULL DEFAULT '{}',
        force_password_change INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        password_changed_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        created_by BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  }
};
