module.exports = {
  name: '015_technician_stock',
  up: async (client) => {
    // ── Technician roster ──────────────────────────────────────────────
    // Lightweight identity for the people who carry a personal spare-parts
    // kit. `user_id` links to a login account when the technician has one,
    // but it stays nullable because many field techs do not. `full_name`
    // is the canonical display name and intentionally mirrors the free-text
    // `repairs.technician` / `withdrawals.recipient` values so historical
    // rows line up after seeding below.
    await client.query(`
      CREATE TABLE IF NOT EXISTS technicians (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        full_name TEXT NOT NULL UNIQUE,
        code TEXT UNIQUE,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_technicians_user_id ON technicians(user_id)`);

    // ── Technician spare-stock ledger ──────────────────────────────────
    // Append-only single source of truth for a technician's trunk stock.
    // `quantity` is signed by convention:
    //   LOAD    +qty   (warehouse -> technician kit)
    //   INSTALL -qty   (technician kit -> installed at a station, "the swap")
    //   RETURN  -qty   (technician kit -> back to warehouse)
    //   ADJUST  ±qty   (reconciliation / manual correction)
    // A technician's on-hand balance is SUM(quantity) over their rows —
    // see technician_holdings_view. Serialized items get one row per S/N
    // (instance_id set); bulk items get one aggregate row.
    await client.query(`
      CREATE TABLE IF NOT EXISTS technician_stock_movements (
        id BIGSERIAL PRIMARY KEY,
        movement_no TEXT UNIQUE,
        technician_id BIGINT NOT NULL REFERENCES technicians(id),
        movement_type TEXT NOT NULL,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id),
        instance_id BIGINT REFERENCES inventory_instances(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        station_area_id BIGINT REFERENCES station_areas(id) ON DELETE SET NULL,
        repair_id BIGINT REFERENCES repairs(id) ON DELETE SET NULL,
        removed_serial TEXT,
        removed_model TEXT,
        note TEXT,
        performed_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tsm_technician_id ON technician_stock_movements(technician_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tsm_inventory_id ON technician_stock_movements(inventory_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tsm_station_id ON technician_stock_movements(station_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tsm_instance_id ON technician_stock_movements(instance_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tsm_movement_type ON technician_stock_movements(movement_type)`);

    // ── Current on-hand balance per technician per item (bulk + serialized aggregate) ──
    await client.query(`
      CREATE OR REPLACE VIEW technician_holdings_view AS
      SELECT t.id AS technician_id, t.full_name, m.inventory_id,
             i.name AS product_name, i.model, i.requires_sn,
             SUM(m.quantity) AS on_hand_qty
      FROM technicians t
      JOIN technician_stock_movements m ON m.technician_id = t.id
      JOIN inventory i ON m.inventory_id = i.id
      GROUP BY t.id, t.full_name, m.inventory_id, i.name, i.model, i.requires_sn
      HAVING SUM(m.quantity) <> 0
    `);

    // ── Serialized units currently in a technician's custody ───────────
    // An instance is "currently held" when its LATEST movement is a LOAD
    // (not yet INSTALL/RETURN). DISTINCT ON picks the latest row per
    // instance; the outer filter keeps only those still on LOAD.
    await client.query(`
      CREATE OR REPLACE VIEW technician_held_instances_view AS
      SELECT latest.instance_id, latest.technician_id, latest.full_name,
             latest.inventory_id, latest.product_name, latest.model,
             latest.serial_number, latest.condition, latest.instance_status
      FROM (
        SELECT DISTINCT ON (m.instance_id)
               m.instance_id, m.technician_id, m.movement_type AS last_movement_type,
               t.full_name, inst.inventory_id, i.name AS product_name, i.model,
               inst.serial_number, inst.condition, inst.status AS instance_status
        FROM technician_stock_movements m
        JOIN inventory_instances inst ON m.instance_id = inst.id
        JOIN technicians t ON m.technician_id = t.id
        JOIN inventory i ON inst.inventory_id = i.id
        WHERE m.instance_id IS NOT NULL
        ORDER BY m.instance_id, m.created_at DESC, m.id DESC
      ) latest
      WHERE latest.last_movement_type = 'LOAD'
    `);

    // ── Seed roster from existing free-text technician / recipient names ──
    // So the current cast of technicians shows up immediately. New names
    // are added on demand via the roster API; ON CONFLICT keeps this idempotent.
    await client.query(`
      INSERT INTO technicians (full_name)
      SELECT DISTINCT TRIM(name) FROM (
        SELECT technician AS name FROM repairs
          WHERE technician IS NOT NULL AND TRIM(technician) <> ''
        UNION
        SELECT recipient AS name FROM withdrawals
          WHERE recipient IS NOT NULL AND TRIM(recipient) <> ''
      ) src
      WHERE TRIM(name) <> ''
      ON CONFLICT (full_name) DO NOTHING
    `);
  }
};
