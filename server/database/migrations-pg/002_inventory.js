module.exports = {
  name: '002_inventory',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT,
        description TEXT,
        quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 10,
        requires_sn INTEGER DEFAULT 1,
        image_path TEXT,
        storage_location TEXT,
        unit_price REAL DEFAULT 0,
        warranty_months INTEGER DEFAULT 36,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }
};
