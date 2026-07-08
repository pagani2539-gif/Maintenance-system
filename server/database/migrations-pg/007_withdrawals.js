module.exports = {
  name: '007_withdrawals',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id BIGSERIAL PRIMARY KEY,
        recipient TEXT NOT NULL,
        type TEXT NOT NULL,
        note TEXT,
        project_name TEXT,
        location TEXT,
        station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        station_area_id BIGINT REFERENCES station_areas(id) ON DELETE SET NULL,
        company_id BIGINT,
        return_due_date TEXT,
        contract_id BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_withdrawals_station_id ON withdrawals(station_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_withdrawals_station_area_id ON withdrawals(station_area_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_withdrawals_contract_id ON withdrawals(contract_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_items (
        id BIGSERIAL PRIMARY KEY,
        withdrawal_id BIGINT REFERENCES withdrawals(id) ON DELETE CASCADE,
        inventory_id BIGINT REFERENCES inventory(id),
        quantity INTEGER NOT NULL,
        serial_numbers TEXT
      )
    `);
  }
};
