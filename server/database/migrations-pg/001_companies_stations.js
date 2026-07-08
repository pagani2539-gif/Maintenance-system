module.exports = {
  name: '001_companies_stations',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id BIGSERIAL PRIMARY KEY,
        name_th TEXT NOT NULL,
        name_en TEXT,
        name_short TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        tax_id TEXT,
        website TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companies_default ON companies(is_default)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT UNIQUE NOT NULL,
        station_type TEXT NOT NULL,
        highway_no TEXT NOT NULL,
        km_post TEXT,
        direction TEXT NOT NULL,
        region TEXT NOT NULL,
        province TEXT NOT NULL,
        status INTEGER DEFAULT 1,
        deleted_at TIMESTAMPTZ,
        deleted_by TEXT,
        responsible_person TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS station_areas (
        id BIGSERIAL PRIMARY KEY,
        station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_station_area ON station_areas(station_id, name)`);
  }
};
