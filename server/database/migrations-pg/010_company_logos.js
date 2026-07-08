module.exports = {
  name: '010_company_logos',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_logos (
        id BIGSERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        file_path TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        company_id BIGINT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_company_logos_default ON company_logos(is_default)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_logos_company ON company_logos(company_id)`);
  }
};
