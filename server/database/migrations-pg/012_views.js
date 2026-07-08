module.exports = {
  name: '012_views',
  up: async (client) => {
    await client.query(`
      CREATE OR REPLACE VIEW repairs_view AS
      SELECT r.id, r.ticket_no, r.reporter, r.device_name, r.problem, r.priority, r.status,
             r.technician, r.repair_note, r.is_read, r.type, r.received_at, r.created_at, r.updated_at,
             r.project_name, r.station_id, r.station_area_id, r.instance_id, r.inventory_id,
             r.location as location_snapshot,
             COALESCE(s.name, r.location) as location,
             s.name as station_name,
             s.code as station_code,
             s.status as station_status,
             s.province as station_province,
             s.region as station_region,
             sa.name as station_area_name
      FROM repairs r
      LEFT JOIN stations s ON r.station_id = s.id
      LEFT JOIN station_areas sa ON r.station_area_id = sa.id
    `);

    await client.query(`
      CREATE OR REPLACE VIEW withdrawals_view AS
      SELECT w.id, w.recipient, w.type, w.note, w.project_name, w.created_at, w.station_id, w.station_area_id,
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
             c.contract_no,
             c.name as contract_name,
             c.year_be as contract_year
      FROM withdrawals w
      LEFT JOIN stations s ON w.station_id = s.id
      LEFT JOIN station_areas sa ON w.station_area_id = sa.id
      LEFT JOIN contracts c ON w.contract_id = c.id
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
             c.contract_no,
             c.name as contract_name,
             c.year_be as contract_year
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
      SELECT inst.id, inst.inventory_id, inst.serial_number, inst.condition, inst.status, inst.created_at, inst.updated_at, inst.station_id,
             inst.current_location as location_snapshot,
             COALESCE(s.name, inst.current_location) as location,
             s.name as station_name,
             s.code as station_code,
             s.status as station_status,
             NULL::BIGINT as station_area_id,
             NULL::TEXT as station_area_name,
             inst.contract_id,
             c.contract_no,
             c.name as contract_name,
             c.year_be as contract_year
      FROM inventory_instances inst
      LEFT JOIN stations s ON inst.station_id = s.id
      LEFT JOIN contracts c ON inst.contract_id = c.id
    `);
  }
};
