const fs = require('fs');
const path = require('path');
const { pool } = require('../database/db');

describe('Fresh PostgreSQL migrations', () => {
  let client;
  const schema = `migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('builds a new schema and subtracts returns only from the matching item', async () => {
    const migrationsDir = path.join(__dirname, '../database/migrations-pg');
    const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.js')).sort();

    for (const file of files) {
      const migration = require(path.join(migrationsDir, file));
      await migration.up(client);

      if (migration.name === '015_technician_stock') {
        const { rows: stationRows } = await client.query(`
          INSERT INTO stations (code, name, station_type, highway_no, direction, region, province)
          VALUES ('MIG-STATION', 'Migration Station', 'TEST', '1', 'INBOUND', 'CENTRAL', 'BANGKOK')
          RETURNING id
        `);
        const { rows: inventoryRows } = await client.query(`
          INSERT INTO inventory (name, quantity, min_stock, requires_sn)
          VALUES ('Migration Item A', 10, 0, 0), ('Migration Item B', 10, 0, 0)
          RETURNING id
        `);
        const { rows: withdrawalRows } = await client.query(`
          INSERT INTO withdrawals (recipient, type, project_name, location, station_id)
          VALUES ('Migration Test', 'ติดตั้งใหม่', 'Migration Project', 'Migration Station', $1)
          RETURNING id
        `, [stationRows[0].id]);
        await client.query(`
          INSERT INTO withdrawal_items (withdrawal_id, inventory_id, quantity)
          VALUES ($1, $2, 2), ($1, $3, 3)
        `, [withdrawalRows[0].id, inventoryRows[0].id, inventoryRows[1].id]);
        await client.query(`
          INSERT INTO inventory_transactions (
            inventory_id, transaction_type, quantity_returned, withdrawal_id, station_id
          ) VALUES ($1, 'RETURN', 1, $2, $3)
        `, [inventoryRows[0].id, withdrawalRows[0].id, stationRows[0].id]);
      }
    }

    const { rows: balances } = await client.query(`
      SELECT i.name, si.quantity
      FROM station_inventory si
      JOIN inventory i ON i.id = si.inventory_id
      ORDER BY i.name
    `);
    expect(balances.map(row => [row.name, Number(row.quantity)])).toEqual([
      ['Migration Item A', 1],
      ['Migration Item B', 3],
    ]);

    const { rows: lots } = await client.query(`
      SELECT i.name, l.quantity_remaining
      FROM station_inventory_lots l
      JOIN inventory i ON i.id = l.inventory_id
      ORDER BY i.name
    `);
    expect(lots.map(row => [row.name, Number(row.quantity_remaining)])).toEqual([
      ['Migration Item A', 1],
      ['Migration Item B', 3],
    ]);
  });
});
