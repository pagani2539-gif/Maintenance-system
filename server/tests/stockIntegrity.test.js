const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../index');
const { query } = require('../database/db');

describe('Stock integrity guards', () => {
  const runKey = `integrity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const username = `${runKey}_admin`;
  const password = 'stock_integrity_test_password';
  const inventoryIds = [];
  const stationIds = [];
  let token;

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const createStation = async (suffix) => {
    const { rows } = await query(`
      INSERT INTO stations (code, name, station_type, highway_no, direction, region, province)
      VALUES ($1, $2, 'TEST', '1', 'INBOUND', 'CENTRAL', 'BANGKOK')
      RETURNING id, name
    `, [`${runKey}_${suffix}`, `${runKey} ${suffix}`]);
    stationIds.push(Number(rows[0].id));
    return rows[0];
  };

  const createInventory = async (suffix, quantity = 5, requiresSn = 0) => {
    const { rows } = await query(`
      INSERT INTO inventory (name, quantity, min_stock, requires_sn)
      VALUES ($1, $2, 0, $3)
      RETURNING id, quantity
    `, [`${runKey} ${suffix}`, quantity, requiresSn]);
    inventoryIds.push(Number(rows[0].id));
    return rows[0];
  };

  const createWithdrawal = async ({ station, inventory, quantity = 1, serial_numbers = [] }) => (
    auth(request(app).post('/api/withdrawals')).send({
      type: 'ติดตั้งใหม่',
      project_name: runKey,
      location: station.name,
      station_id: Number(station.id),
      contract_reference_type: 'none',
      contract_reference_note: 'integration test',
      items: [{ inventory_id: Number(inventory.id), quantity, serial_numbers }],
    })
  );

  beforeAll(async () => {
    const hash = bcrypt.hashSync(password, 10);
    await query(`
      INSERT INTO users (username, password_hash, full_name, is_full, is_active)
      VALUES ($1, $2, $3, 1, 1)
    `, [username, hash, 'Stock Integrity Test Admin']);
    const login = await request(app).post('/api/auth/login').send({ username, password });
    token = login.body.token;
  });

  afterAll(async () => {
    await query('DELETE FROM repairs WHERE ticket_no LIKE $1', [`${runKey}%`]);
    if (inventoryIds.length > 0) {
      await query('DELETE FROM station_asset_events WHERE inventory_id = ANY($1::BIGINT[])', [inventoryIds]);
      await query('DELETE FROM inventory_transactions WHERE inventory_id = ANY($1::BIGINT[])', [inventoryIds]);
      await query('DELETE FROM inventory_instances WHERE inventory_id = ANY($1::BIGINT[])', [inventoryIds]);
      await query('DELETE FROM withdrawal_items WHERE inventory_id = ANY($1::BIGINT[])', [inventoryIds]);
      await query('DELETE FROM station_inventory_lots WHERE inventory_id = ANY($1::BIGINT[])', [inventoryIds]);
      await query('DELETE FROM station_inventory WHERE inventory_id = ANY($1::BIGINT[])', [inventoryIds]);
      await query('DELETE FROM inventory WHERE id = ANY($1::BIGINT[])', [inventoryIds]);
    }
    await query('DELETE FROM withdrawals WHERE project_name = $1', [runKey]);
    if (stationIds.length > 0) await query('DELETE FROM stations WHERE id = ANY($1::BIGINT[])', [stationIds]);
    await query('DELETE FROM users WHERE username = $1', [username]);
  });

  it('rejects negative withdrawal quantity without changing stock', async () => {
    const station = await createStation('negative_station');
    const inventory = await createInventory('negative_item', 5);

    const response = await createWithdrawal({ station, inventory, quantity: -2 });
    expect(response.statusCode).toBe(400);

    const { rows } = await query('SELECT quantity FROM inventory WHERE id = $1', [inventory.id]);
    expect(Number(rows[0].quantity)).toBe(5);
  });

  it('rejects too many or duplicate serial numbers', async () => {
    const station = await createStation('serial_validation_station');
    const inventory = await createInventory('serial_validation_item', 2, 1);

    const tooMany = await createWithdrawal({
      station,
      inventory,
      quantity: 1,
      serial_numbers: [`${runKey}-SN-1`, `${runKey}-SN-2`],
    });
    expect(tooMany.statusCode).toBe(400);

    const duplicate = await createWithdrawal({
      station,
      inventory,
      quantity: 2,
      serial_numbers: [`${runKey}-SN-DUP`, `${runKey}-sn-dup`],
    });
    expect(duplicate.statusCode).toBe(400);
  });

  it('rejects a serial number already deployed at another station', async () => {
    const sourceStation = await createStation('occupied_source');
    const targetStation = await createStation('occupied_target');
    const inventory = await createInventory('occupied_item', 2, 1);
    const serial = `${runKey}-OCCUPIED`;
    await query(`
      INSERT INTO inventory_instances (inventory_id, serial_number, status, station_id, current_location)
      VALUES ($1, $2, 'Withdrawn', $3, $4)
    `, [inventory.id, serial, sourceStation.id, sourceStation.name]);

    const response = await createWithdrawal({
      station: targetStation,
      inventory,
      quantity: 1,
      serial_numbers: [serial],
    });
    expect(response.statusCode).toBe(409);
  });

  it('converts an untracked lot unit when S/N is assigned later', async () => {
    const station = await createStation('late_serial_station');
    const inventory = await createInventory('late_serial_item', 3, 1);
    const created = await createWithdrawal({ station, inventory, quantity: 2 });
    expect(created.statusCode).toBe(201);

    const { rows: itemRows } = await query(
      'SELECT id FROM withdrawal_items WHERE withdrawal_id = $1',
      [created.body.id]
    );
    const assigned = await auth(
      request(app).put(`/api/withdrawals/${created.body.id}/items/${itemRows[0].id}/serial-numbers`)
    ).send({ serial_numbers: [`${runKey}-LATE-SN`] });
    expect(assigned.statusCode).toBe(200);

    const { rows: lotRows } = await query(
      'SELECT quantity_remaining, untracked_remaining FROM station_inventory_lots WHERE withdrawal_item_id = $1',
      [itemRows[0].id]
    );
    expect(Number(lotRows[0].quantity_remaining)).toBe(2);
    expect(Number(lotRows[0].untracked_remaining)).toBe(1);
  });

  it('rejects a return whose inventory does not match the source transaction', async () => {
    const station = await createStation('return_mismatch_station');
    const inventory = await createInventory('return_source_item', 2);
    const otherInventory = await createInventory('return_other_item', 2);
    const created = await createWithdrawal({ station, inventory, quantity: 1 });
    expect(created.statusCode).toBe(201);

    const { rows: txRows } = await query(`
      SELECT id FROM inventory_transactions
      WHERE withdrawal_id = $1 AND transaction_type = 'WITHDRAW'
      ORDER BY id DESC LIMIT 1
    `, [created.body.id]);
    const response = await auth(request(app).post('/api/transactions/return'))
      .field('transaction_id', String(txRows[0].id))
      .field('inventory_id', String(otherInventory.id))
      .field('quantity', '1');
    expect(response.statusCode).toBe(400);
  });

  it('fully reverses an untouched serialized withdrawal on cancellation', async () => {
    const station = await createStation('cancel_station');
    const inventory = await createInventory('cancel_item', 2, 1);
    const serial = `${runKey}-CANCEL-SN`;
    await query(`
      INSERT INTO inventory_instances (inventory_id, serial_number, status, current_location)
      VALUES ($1, $2, 'In Stock', 'Warehouse')
    `, [inventory.id, serial]);
    const created = await createWithdrawal({ station, inventory, quantity: 1, serial_numbers: [serial] });
    expect(created.statusCode).toBe(201);

    const cancelled = await auth(request(app).delete(`/api/withdrawals/${created.body.id}`));
    expect(cancelled.statusCode).toBe(200);

    const { rows: stockRows } = await query('SELECT quantity FROM inventory WHERE id = $1', [inventory.id]);
    const { rows: instanceRows } = await query(
      'SELECT status, station_id FROM inventory_instances WHERE serial_number = $1',
      [serial]
    );
    expect(Number(stockRows[0].quantity)).toBe(2);
    expect(instanceRows[0]).toMatchObject({ status: 'In Stock', station_id: null });
  });

  it('replaces a station device atomically and consumes the new warehouse unit', async () => {
    const station = await createStation('replace_station');
    const inventory = await createInventory('replace_item', 1, 1);
    const oldSerial = `${runKey}-REPLACE-OLD`;
    const newSerial = `${runKey}-REPLACE-NEW`;
    const { rows: instanceRows } = await query(`
      INSERT INTO inventory_instances (inventory_id, serial_number, status, station_id, current_location)
      VALUES ($1, $2, 'Withdrawn', $3, $4), ($1, $5, 'In Stock', NULL, 'Warehouse')
      RETURNING id, serial_number
    `, [inventory.id, oldSerial, station.id, station.name, newSerial]);
    const oldInstance = instanceRows.find(row => row.serial_number === oldSerial);
    await query(`
      INSERT INTO station_inventory (station_id, inventory_id, quantity, updated_by)
      VALUES ($1, $2, 1, 'test')
    `, [station.id, inventory.id]);
    await query(`
      INSERT INTO station_inventory_lots (
        station_id, inventory_id, quantity_received, quantity_remaining, untracked_remaining
      ) VALUES ($1, $2, 1, 1, 0)
    `, [station.id, inventory.id]);
    const { rows: repairRows } = await query(`
      INSERT INTO repairs (
        ticket_no, reporter, location, station_id, device_name, problem,
        status, type, instance_id, inventory_id
      ) VALUES ($1, 'Tester', $2, $3, 'Replace Device', 'Broken',
                'กำลังดำเนินการ', 'repair', $4, $5)
      RETURNING id
    `, [`${runKey}_REPAIR`, station.name, station.id, oldInstance.id, inventory.id]);

    const response = await auth(
      request(app).post(`/api/repairs/${repairRows[0].id}/replace-device`)
    ).send({ old_serial: oldSerial, old_model: 'OLD', new_serial: newSerial, new_model: 'NEW' });
    expect(response.statusCode).toBe(200);

    const { rows: stockRows } = await query('SELECT quantity FROM inventory WHERE id = $1', [inventory.id]);
    const { rows: stationRows } = await query(
      'SELECT quantity FROM station_inventory WHERE station_id = $1 AND inventory_id = $2',
      [station.id, inventory.id]
    );
    const { rows: serialRows } = await query(`
      SELECT serial_number, status, station_id
      FROM inventory_instances
      WHERE serial_number IN ($1, $2)
      ORDER BY serial_number
    `, [oldSerial, newSerial]);
    expect(Number(stockRows[0].quantity)).toBe(0);
    expect(Number(stationRows[0].quantity)).toBe(1);
    expect(serialRows.find(row => row.serial_number === oldSerial)).toMatchObject({ status: 'Damaged', station_id: null });
    expect(serialRows.find(row => row.serial_number === newSerial)).toMatchObject({ status: 'Withdrawn', station_id: Number(station.id) });
  });

  it('splits a bulk return source when part of a lot moves to another station', async () => {
    const sourceStation = await createStation('split_source');
    const targetStation = await createStation('split_target');
    const inventory = await createInventory('split_item', 6);
    const created = await createWithdrawal({ station: sourceStation, inventory, quantity: 4 });
    expect(created.statusCode).toBe(201);

    const moved = await auth(
      request(app).post(`/api/stations/${sourceStation.id}/assets/move`)
    ).send({ inventory_id: Number(inventory.id), quantity: 2, to_station_id: Number(targetStation.id) });
    expect(moved.statusCode).toBe(200);

    const { rows: activeRows } = await query(`
      SELECT id, station_id, quantity_withdrawn
      FROM inventory_transactions
      WHERE withdrawal_id = $1 AND transaction_type = 'WITHDRAW' AND status <> 'RETURNED'
      ORDER BY station_id
    `, [created.body.id]);
    expect(activeRows.map(row => [Number(row.station_id), Number(row.quantity_withdrawn)])).toEqual([
      [Number(sourceStation.id), 2],
      [Number(targetStation.id), 2],
    ]);

    const targetTransaction = activeRows.find(row => Number(row.station_id) === Number(targetStation.id));
    const returned = await auth(request(app).post('/api/transactions/return'))
      .field('transaction_id', String(targetTransaction.id))
      .field('inventory_id', String(inventory.id))
      .field('quantity', '2');
    expect(returned.statusCode).toBe(200);

    const { rows: balances } = await query(`
      SELECT station_id, quantity FROM station_inventory
      WHERE inventory_id = $1 ORDER BY station_id
    `, [inventory.id]);
    expect(balances.map(row => [Number(row.station_id), Number(row.quantity)])).toEqual([
      [Number(sourceStation.id), 2],
    ]);
  });
});
