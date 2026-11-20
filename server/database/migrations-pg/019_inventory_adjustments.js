module.exports = {
  name: '019_inventory_adjustments',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id BIGSERIAL PRIMARY KEY,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        operation TEXT NOT NULL CHECK (operation IN ('ADD', 'REMOVE')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        reason TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        requested_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        requested_by TEXT NOT NULL,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        review_note TEXT,
        old_quantity INTEGER,
        new_quantity INTEGER
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_status ON inventory_adjustments(status, requested_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_inventory_id ON inventory_adjustments(inventory_id, requested_at DESC)');
  }
};
