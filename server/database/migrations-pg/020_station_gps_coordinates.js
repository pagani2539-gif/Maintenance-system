module.exports = {
  name: '020_station_gps_coordinates',
  up: async (client) => {
    await client.query(`
      ALTER TABLE stations
        ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
    `);

    await client.query(`
      ALTER TABLE stations
        ADD CONSTRAINT stations_gps_coordinates_together_chk
          CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR (latitude IS NOT NULL AND longitude IS NOT NULL)
          ),
        ADD CONSTRAINT stations_latitude_range_chk
          CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
        ADD CONSTRAINT stations_longitude_range_chk
          CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    `);
  }
};
