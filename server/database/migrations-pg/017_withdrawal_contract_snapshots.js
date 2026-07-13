module.exports = {
  name: '017_withdrawal_contract_snapshots',
  up: async (client) => {
    await client.query(`
      ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS withdrawal_date DATE,
        ADD COLUMN IF NOT EXISTS contract_reference_type TEXT,
        ADD COLUMN IF NOT EXISTS contract_reference_note TEXT,
        ADD COLUMN IF NOT EXISTS contract_no_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS contract_name_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS contract_year_snapshot INTEGER,
        ADD COLUMN IF NOT EXISTS contract_company_snapshot TEXT
    `);

    await client.query(`
      ALTER TABLE inventory_instances
        ADD COLUMN IF NOT EXISTS source_withdrawal_id BIGINT REFERENCES withdrawals(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS withdrawal_date DATE,
        ADD COLUMN IF NOT EXISTS project_name_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS contract_no_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS contract_name_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS contract_year_snapshot INTEGER,
        ADD COLUMN IF NOT EXISTS contract_company_snapshot TEXT
    `);

    await client.query(`
      UPDATE withdrawals w
      SET withdrawal_date = COALESCE(w.withdrawal_date, w.created_at::date),
          contract_reference_type = COALESCE(
            w.contract_reference_type,
            CASE WHEN w.contract_id IS NULL THEN 'legacy' ELSE 'contract' END
          ),
          contract_no_snapshot = COALESCE(w.contract_no_snapshot, c.contract_no),
          contract_name_snapshot = COALESCE(w.contract_name_snapshot, c.name),
          contract_year_snapshot = COALESCE(w.contract_year_snapshot, c.year_be),
          contract_company_snapshot = COALESCE(w.contract_company_snapshot, co.name_th)
      FROM contracts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE w.contract_id = c.id
    `);

    await client.query(`
      UPDATE withdrawals
      SET withdrawal_date = COALESCE(withdrawal_date, created_at::date),
          contract_reference_type = COALESCE(contract_reference_type, 'legacy')
      WHERE withdrawal_date IS NULL OR contract_reference_type IS NULL
    `);

    await client.query(`
      UPDATE inventory_instances ii
      SET withdrawal_date = COALESCE(ii.withdrawal_date, ii.created_at::date),
          contract_no_snapshot = COALESCE(ii.contract_no_snapshot, c.contract_no),
          contract_name_snapshot = COALESCE(ii.contract_name_snapshot, c.name),
          contract_year_snapshot = COALESCE(ii.contract_year_snapshot, c.year_be),
          contract_company_snapshot = COALESCE(ii.contract_company_snapshot, co.name_th)
      FROM contracts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE ii.contract_id = c.id
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_withdrawals_withdrawal_date ON withdrawals(withdrawal_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_instances_source_withdrawal ON inventory_instances(source_withdrawal_id)`);

    await client.query(`
      CREATE OR REPLACE VIEW withdrawals_view AS
      SELECT w.id, w.recipient, w.type, w.note, w.project_name, w.created_at,
             w.station_id, w.station_area_id,
             w.location as location_snapshot,
             COALESCE(s.name, w.location) as location,
             s.name as station_name,
             s.code as station_code,
             s.status as station_status,
             s.province as station_province,
             s.region as station_region,
             sa.name as station_area_name,
             w.return_due_date,
             w.contract_id,
             COALESCE(w.contract_no_snapshot, c.contract_no) as contract_no,
             COALESCE(w.contract_name_snapshot, c.name) as contract_name,
             COALESCE(w.contract_year_snapshot, c.year_be) as contract_year,
             w.withdrawal_date,
             COALESCE(w.contract_company_snapshot, co.name_th) as contract_company_name,
             w.contract_reference_type,
             w.contract_reference_note
      FROM withdrawals w
      LEFT JOIN stations s ON w.station_id = s.id
      LEFT JOIN station_areas sa ON w.station_area_id = sa.id
      LEFT JOIN contracts c ON w.contract_id = c.id
      LEFT JOIN companies co ON co.id = c.company_id
    `);

    await client.query(`
      CREATE OR REPLACE VIEW transactions_view AS
      SELECT t.id, t.inventory_id, t.instance_id, t.transaction_type, t.quantity_added, t.quantity_withdrawn,
             t.quantity_borrowed, t.quantity_returned, t.project_name, t.station_id, t.user_name, t.note,
             t.withdrawal_id, t.return_image, t.created_at, t.status,
             t.location as location_snapshot,
             COALESCE(s.name, t.location) as location,
             s.name as station_name,
             s.code as station_code,
             s.status as station_status,
             s.province as station_province,
             i.name as product_name,
             i.model as product_model,
             inst.serial_number,
             inst.condition,
             w.type as withdrawal_type,
             w.return_due_date,
             w.station_area_id,
             sa.name as station_area_name,
             t.contract_id,
             COALESCE(w.contract_no_snapshot, c.contract_no) as contract_no,
             COALESCE(w.contract_name_snapshot, c.name) as contract_name,
             COALESCE(w.contract_year_snapshot, c.year_be) as contract_year
      FROM inventory_transactions t
      JOIN inventory i ON t.inventory_id = i.id
      LEFT JOIN inventory_instances inst ON t.instance_id = inst.id
      LEFT JOIN withdrawals w ON t.withdrawal_id = w.id
      LEFT JOIN stations s ON t.station_id = s.id
      LEFT JOIN station_areas sa ON w.station_area_id = sa.id
      LEFT JOIN contracts c ON t.contract_id = c.id
    `);

    await client.query(`
      CREATE OR REPLACE VIEW inventory_instances_view AS
      SELECT inst.id, inst.inventory_id, inst.serial_number, inst.condition, inst.status,
             inst.created_at, inst.updated_at, inst.station_id,
             inst.current_location as location_snapshot,
             COALESCE(s.name, inst.current_location) as location,
             s.name as station_name,
             s.code as station_code,
             s.status as station_status,
             NULL::BIGINT as station_area_id,
             NULL::TEXT as station_area_name,
             inst.contract_id,
             COALESCE(inst.contract_no_snapshot, c.contract_no) as contract_no,
             COALESCE(inst.contract_name_snapshot, c.name) as contract_name,
             COALESCE(inst.contract_year_snapshot, c.year_be) as contract_year
      FROM inventory_instances inst
      LEFT JOIN stations s ON inst.station_id = s.id
      LEFT JOIN contracts c ON inst.contract_id = c.id
    `);
  }
};
