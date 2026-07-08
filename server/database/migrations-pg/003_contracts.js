module.exports = {
  name: '003_contracts',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id BIGSERIAL PRIMARY KEY,
        contract_no TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        year_be INTEGER NOT NULL,
        company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
        start_date TEXT,
        end_date TEXT,
        note TEXT,
        status INTEGER DEFAULT 1,
        deleted_at TIMESTAMPTZ,
        deleted_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }
};
