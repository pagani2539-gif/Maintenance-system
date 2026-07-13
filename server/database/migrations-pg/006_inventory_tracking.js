module.exports = {
  name: '006_inventory_tracking',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_instances (
        id BIGSERIAL PRIMARY KEY,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        serial_number TEXT UNIQUE,
        condition TEXT DEFAULT 'New',
        status TEXT DEFAULT 'In Stock',
        current_location TEXT,
        station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        contract_id BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inv_inst_station_id ON inventory_instances(station_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_instances_contract_id ON inventory_instances(contract_id)`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_inventory_instances_serial_ci
      ON inventory_instances (LOWER(serial_number))
      WHERE serial_number IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS station_asset_status (
        id BIGSERIAL PRIMARY KEY,
        station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'ปกติ',
        note TEXT,
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(station_id, inventory_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sas_station ON station_asset_status(station_id)`);
  }
};
