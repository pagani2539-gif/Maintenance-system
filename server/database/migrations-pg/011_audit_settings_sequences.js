module.exports = {
  name: '011_audit_settings_sequences',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id BIGINT NOT NULL,
        action TEXT NOT NULL,
        old_data JSONB,
        new_data JSONB,
        user_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sequences (
        prefix TEXT NOT NULL,
        date_part TEXT NOT NULL,
        seq INTEGER NOT NULL,
        PRIMARY KEY (prefix, date_part)
      )
    `);
  }
};
