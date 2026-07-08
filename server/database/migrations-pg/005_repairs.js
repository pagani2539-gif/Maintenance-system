module.exports = {
  name: '005_repairs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS repairs (
        id BIGSERIAL PRIMARY KEY,
        ticket_no TEXT UNIQUE,
        reporter TEXT,
        location TEXT,
        device_name TEXT,
        problem TEXT,
        priority TEXT DEFAULT 'ปกติ',
        status TEXT DEFAULT 'รอดำเนินการ',
        technician TEXT,
        repair_note TEXT,
        is_read INTEGER DEFAULT 0,
        type TEXT DEFAULT 'repair',
        project_name TEXT,
        station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        station_area_id BIGINT REFERENCES station_areas(id) ON DELETE SET NULL,
        company_id BIGINT,
        instance_id BIGINT,
        inventory_id BIGINT,
        received_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repairs_station_id ON repairs(station_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repairs_station_area_id ON repairs(station_area_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS repair_logs (
        id BIGSERIAL PRIMARY KEY,
        repair_id BIGINT REFERENCES repairs(id) ON DELETE CASCADE,
        action TEXT,
        "user" TEXT,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS device_changes (
        id BIGSERIAL PRIMARY KEY,
        repair_id BIGINT REFERENCES repairs(id) ON DELETE CASCADE,
        old_serial TEXT,
        old_model TEXT,
        new_serial TEXT,
        new_model TEXT,
        changed_by TEXT,
        changed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS repair_images (
        id BIGSERIAL PRIMARY KEY,
        repair_id BIGINT REFERENCES repairs(id) ON DELETE CASCADE,
        file_path TEXT,
        image_type TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }
};
