module.exports = {
  name: '014_stock_counts',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_counts (
        id BIGSERIAL PRIMARY KEY,
        count_no TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        note TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_by TEXT,
        completed_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_count_items (
        id BIGSERIAL PRIMARY KEY,
        count_id BIGINT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        expected_qty INTEGER NOT NULL DEFAULT 0,
        counted_qty INTEGER,
        note TEXT,
        counted_by TEXT,
        counted_at TIMESTAMPTZ,
        UNIQUE(count_id, inventory_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stock_count_items_count_id ON stock_count_items(count_id)`);
  }
};
