module.exports = {
  name: '008_transactions',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id BIGSERIAL PRIMARY KEY,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        instance_id BIGINT REFERENCES inventory_instances(id) ON DELETE SET NULL,
        transaction_type TEXT NOT NULL,
        quantity_added INTEGER DEFAULT 0,
        quantity_withdrawn INTEGER DEFAULT 0,
        quantity_borrowed INTEGER DEFAULT 0,
        quantity_returned INTEGER DEFAULT 0,
        project_name TEXT,
        location TEXT,
        user_name TEXT,
        note TEXT,
        withdrawal_id BIGINT,
        status TEXT DEFAULT 'ACTIVE',
        return_image TEXT,
        station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        contract_id BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inv_tx_station_id ON inventory_transactions(station_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_transactions_contract_id ON inventory_transactions(contract_id)`);
  }
};
