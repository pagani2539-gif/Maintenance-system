module.exports = {
  name: '018_station_asset_ledger',
  up: async (client) => {
    await client.query(`
      ALTER TABLE stations
        ADD COLUMN IF NOT EXISTS operational_start_date DATE,
        ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS decommissioned_at TIMESTAMPTZ
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS station_inventory_lots (
        id BIGSERIAL PRIMARY KEY,
        station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        withdrawal_id BIGINT REFERENCES withdrawals(id) ON DELETE CASCADE,
        withdrawal_item_id BIGINT REFERENCES withdrawal_items(id) ON DELETE CASCADE,
        quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
        quantity_remaining INTEGER NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
        untracked_remaining INTEGER NOT NULL DEFAULT 0 CHECK (untracked_remaining >= 0),
        withdrawal_date DATE,
        project_name_snapshot TEXT,
        contract_id BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
        contract_no_snapshot TEXT,
        contract_name_snapshot TEXT,
        contract_year_snapshot INTEGER,
        contract_company_snapshot TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_inventory_lots_station ON station_inventory_lots(station_id, inventory_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_inventory_lots_withdrawal ON station_inventory_lots(withdrawal_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_inventory_lots_remaining ON station_inventory_lots(station_id, quantity_remaining)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS station_asset_events (
        id BIGSERIAL PRIMARY KEY,
        station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        inventory_id BIGINT REFERENCES inventory(id) ON DELETE SET NULL,
        instance_id BIGINT REFERENCES inventory_instances(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        event_at TIMESTAMPTZ DEFAULT NOW(),
        quantity INTEGER NOT NULL DEFAULT 0,
        from_station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        to_station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
        source_withdrawal_id BIGINT REFERENCES withdrawals(id) ON DELETE SET NULL,
        project_name_snapshot TEXT,
        contract_id BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
        contract_no_snapshot TEXT,
        contract_name_snapshot TEXT,
        contract_year_snapshot INTEGER,
        old_serial_number TEXT,
        new_serial_number TEXT,
        note TEXT,
        performed_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_asset_events_station ON station_asset_events(station_id, event_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_asset_events_instance ON station_asset_events(instance_id, event_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_station_asset_events_inventory ON station_asset_events(inventory_id, event_at DESC)`);

    // Backfill one source lot and one withdrawal event for historical station
    // withdrawals. Returns already recorded against a withdrawal are applied
    // so the lot starts at the best-known remaining quantity.
    await client.query(`
      INSERT INTO station_inventory_lots (
        station_id, inventory_id, withdrawal_id, withdrawal_item_id,
        quantity_received, quantity_remaining, untracked_remaining,
        withdrawal_date, project_name_snapshot, contract_id,
        contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
        contract_company_snapshot
      )
      SELECT
        w.station_id,
        wi.inventory_id,
        w.id,
        wi.id,
        wi.quantity,
        GREATEST(0, wi.quantity - COALESCE((
          SELECT SUM(GREATEST(COALESCE(t.quantity_returned, 0), 0))::INTEGER
          FROM inventory_transactions t
          WHERE t.withdrawal_id = w.id
            AND t.inventory_id = wi.inventory_id
            AND t.transaction_type = 'RETURN'
        ), 0)),
        GREATEST(0, wi.quantity - COALESCE((
          SELECT SUM(GREATEST(COALESCE(t.quantity_returned, 0), 0))::INTEGER
          FROM inventory_transactions t
          WHERE t.withdrawal_id = w.id
            AND t.inventory_id = wi.inventory_id
            AND t.transaction_type = 'RETURN'
        ), 0) - CASE
          WHEN wi.serial_numbers IS NULL OR BTRIM(wi.serial_numbers) = '' THEN 0
          ELSE LENGTH(wi.serial_numbers) - LENGTH(REPLACE(wi.serial_numbers, ',', '')) + 1
        END),
        COALESCE(w.withdrawal_date, w.created_at::date),
        w.project_name,
        w.contract_id,
        w.contract_no_snapshot,
        w.contract_name_snapshot,
        w.contract_year_snapshot,
        w.contract_company_snapshot
      FROM withdrawals w
      JOIN withdrawal_items wi ON wi.withdrawal_id = w.id
      WHERE w.station_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM station_inventory_lots existing
          WHERE existing.withdrawal_item_id = wi.id
        )
    `);

    await client.query(`
      INSERT INTO station_asset_events (
        station_id, inventory_id, event_type, event_at, quantity,
        source_withdrawal_id, project_name_snapshot, contract_id,
        contract_no_snapshot, contract_name_snapshot, contract_year_snapshot,
        performed_by, note
      )
      SELECT
        w.station_id, wi.inventory_id, 'WITHDRAW_TO_STATION',
        COALESCE(w.withdrawal_date::timestamptz, w.created_at), wi.quantity,
        w.id, w.project_name, w.contract_id,
        w.contract_no_snapshot, w.contract_name_snapshot, w.contract_year_snapshot,
        w.recipient, 'migration:018'
      FROM withdrawals w
      JOIN withdrawal_items wi ON wi.withdrawal_id = w.id
      WHERE w.station_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM station_asset_events e
          WHERE e.source_withdrawal_id = w.id
            AND e.inventory_id = wi.inventory_id
            AND e.event_type = 'WITHDRAW_TO_STATION'
            AND e.note = 'migration:018'
        )
    `);
  }
};
