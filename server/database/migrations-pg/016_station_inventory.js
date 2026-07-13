module.exports = {
  name: '016_station_inventory',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS station_inventory (
        station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (station_id, inventory_id)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_inventory_station ON station_inventory(station_id)`);

    // Preserve the station assignment of existing withdrawals without
    // fabricating Serial Numbers. S/Ns can still be attached later through
    // the existing withdrawal-item update flow.
    await client.query(`
      WITH withdrawn AS (
        SELECT w.id AS withdrawal_id, w.station_id, wi.inventory_id,
               SUM(wi.quantity)::INTEGER AS withdrawn_quantity
        FROM withdrawals w
        JOIN withdrawal_items wi ON wi.withdrawal_id = w.id
        WHERE w.station_id IS NOT NULL
        GROUP BY w.id, w.station_id, wi.inventory_id
      ), returned AS (
        SELECT withdrawal_id, inventory_id,
               SUM(GREATEST(COALESCE(quantity_returned, 0), 0))::INTEGER AS returned_quantity
        FROM inventory_transactions
        WHERE transaction_type = 'RETURN' AND withdrawal_id IS NOT NULL
        GROUP BY withdrawal_id, inventory_id
      )
      INSERT INTO station_inventory (station_id, inventory_id, quantity, updated_by)
      SELECT wd.station_id, wd.inventory_id,
             SUM(GREATEST(0, wd.withdrawn_quantity - COALESCE(r.returned_quantity, 0)))::INTEGER,
             'migration:016'
      FROM withdrawn wd
      LEFT JOIN returned r
        ON r.withdrawal_id = wd.withdrawal_id
       AND r.inventory_id = wd.inventory_id
      GROUP BY wd.station_id, wd.inventory_id
      HAVING SUM(GREATEST(0, wd.withdrawn_quantity - COALESCE(r.returned_quantity, 0))) > 0
      ON CONFLICT (station_id, inventory_id) DO NOTHING
    `);
  }
};
