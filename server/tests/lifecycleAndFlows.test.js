const request = require('supertest');
const app = require('../index');
const { query } = require('../database/db');
const bcrypt = require('bcryptjs');

describe('Lifecycle and Flows', () => {
  let token = '';
  const testUsername = 'test_admin_lifecycle';
  const testPassword = 'test_admin_lifecycle_password';

  beforeAll(async () => {
    // Wait for migrations and seeding to complete
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Create a temporary test admin user
    const hash = bcrypt.hashSync(testPassword, 10);
    await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, is_active)
       VALUES ($1, $2, $3, 1, 1)
       ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name, is_full = excluded.is_full, is_active = excluded.is_active`,
      [testUsername, hash, 'Lifecycle Test Admin']
    );

    // Login to get token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });

    if (res.body && res.body.token) {
      token = res.body.token;
    }
  });

  afterAll(async () => {
    // Clean up temporary user
    await query(`DELETE FROM users WHERE username = $1`, [testUsername]);
  });

  // Test 1: Migration 036 must preserve return_due_date
  it('should preserve return_due_date in withdrawals_view', async () => {
    const { rows: info } = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'withdrawals_view'`
    );
    const hasDueDate = info.some(col => col.column_name === 'return_due_date');
    expect(hasDueDate).toBe(true);
  });

  // Test 2: getLifecycleReport must calculate age_months / repair_count
  it('should calculate age_months and repair_count in getLifecycleReport', async () => {
    // 0. Insert a mock station
    const stationCode = 'STN-LIFE-' + Math.random().toString(36).substring(7);
    const stationName = 'Mock Lifecycle Station ' + Math.random().toString(36).substring(7);
    const { rows: stationRows } = await query(
      `INSERT INTO stations (code, name, station_type, highway_no, direction, region, province) VALUES ($1, $2, 'Type A', '9', 'Inbound', 'Central', 'Bangkok') RETURNING id`,
      [stationCode, stationName]
    );
    const stationId = Number(stationRows[0].id);

    // 1. Insert a mock inventory item and withdrawn instance
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn) VALUES ('Test Device', 'Model X', 'Desc', 1, 10, 1) RETURNING id`
    );
    const invId = Number(invRows[0].id);

    // Set installed_at (created_at) to 5 months ago
    const fiveMonthsAgo = new Date();
    fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);
    const dateStr = fiveMonthsAgo.toISOString();

    const lifecycleSerial = 'SN-LIFECYCLE-' + Math.random().toString(36).substring(7);
    const { rows: instRows } = await query(
      `INSERT INTO inventory_instances (inventory_id, serial_number, condition, status, station_id, created_at) VALUES ($1, $2, 'New', 'Withdrawn', $3, $4) RETURNING id`,
      [invId, lifecycleSerial, stationId, dateStr]
    );
    const instId = Number(instRows[0].id);

    // 2. Insert mock repairs for this instance
    const ticketNo = 'RP-LIFE-' + Math.random().toString(36).substring(7);
    await query(
      `INSERT INTO repairs (ticket_no, reporter, location, station_id, device_name, problem, status, type, instance_id, inventory_id) VALUES ($1, 'Reporter', 'Location', $2, 'Test Device', 'Problem 1', 'เสร็จสิ้น', 'repair', $3, $4)`,
      [ticketNo, stationId, instId, invId]
    );

    // 3. Request lifecycle report
    const req = request(app).get('/api/inventory/lifecycle-report');
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req;

    expect(res.statusCode).toEqual(200);
    const item = res.body.find(i => Number(i.instance_id) === instId);
    expect(item).toBeDefined();
    expect(item.age_months).toBeGreaterThanOrEqual(4); // allow 4-6 due to boundaries
    expect(item.repair_count).toEqual(1);
  });

  it('should include station-assigned items that do not have S/N yet', async () => {
    const stationCode = 'STN-NOSN-' + Math.random().toString(36).substring(7);
    const stationName = `Station Item Test ${stationCode}`;
    const inventoryName = `Station Item Without S/N ${stationCode}`;
    const { rows: stationRows } = await query(
      `INSERT INTO stations (code, name, station_type, highway_no, direction, region, province)
       VALUES ($1, $2, 'Type A', '9', 'Inbound', 'Central', 'Bangkok') RETURNING id`,
      [stationCode, stationName]
    );
    const stationId = Number(stationRows[0].id);
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, quantity, min_stock, requires_sn)
       VALUES ($1, 0, 0, 1) RETURNING id`,
      [inventoryName]
    );
    const inventoryId = Number(invRows[0].id);

    await query(
      `INSERT INTO station_inventory (station_id, inventory_id, quantity, updated_by)
       VALUES ($1, $2, 3, 'test')`,
      [stationId, inventoryId]
    );

    const req = request(app).get('/api/inventory/lifecycle-report');
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req;

    expect(res.statusCode).toEqual(200);
    const item = res.body.find(row => Number(row.station_id) === stationId && Number(row.inventory_id) === inventoryId);
    expect(item).toMatchObject({
      asset_kind: 'station_stock',
      instance_id: null,
      quantity: 3,
      untracked_quantity: 3,
      requires_sn: 1,
    });
  });

  it('should assign a withdrawal to its station even when S/N is added later', async () => {
    const stationCode = 'STN-WITHDRAW-' + Math.random().toString(36).substring(7);
    const stationName = `Withdrawal Assignment Test ${stationCode}`;
    const inventoryName = `Later S/N Test Device ${stationCode}`;
    const { rows: stationRows } = await query(
      `INSERT INTO stations (code, name, station_type, highway_no, direction, region, province)
       VALUES ($1, $2, 'Type A', '9', 'Inbound', 'Central', 'Bangkok') RETURNING id`,
      [stationCode, stationName]
    );
    const stationId = Number(stationRows[0].id);
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, quantity, min_stock, requires_sn)
       VALUES ($1, 5, 0, 1) RETURNING id`,
      [inventoryName]
    );
    const inventoryId = Number(invRows[0].id);

    const createRes = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ติดตั้งใหม่',
        project_name: 'Station assignment test',
        location: stationName,
        station_id: stationId,
        items: [{ inventory_id: inventoryId, quantity: 2, serial_numbers: [] }],
      });

    expect(createRes.statusCode).toEqual(201);
    const { rows } = await query(
      `SELECT quantity FROM station_inventory WHERE station_id = $1 AND inventory_id = $2`,
      [stationId, inventoryId]
    );
    expect(Number(rows[0].quantity)).toEqual(2);
  });

  it('should expose station asset source data and transfer bulk assets without losing provenance', async () => {
    const sourceCode = 'STN-ASSET-SOURCE-' + Math.random().toString(36).substring(7);
    const targetCode = 'STN-ASSET-TARGET-' + Math.random().toString(36).substring(7);
    const sourceName = 'Source Asset Station ' + sourceCode;
    const targetName = 'Target Asset Station ' + targetCode;
    const { rows: sourceRows } = await query(
      `INSERT INTO stations (code, name, station_type, highway_no, direction, region, province)
       VALUES ($1, $2, 'Type A', '9', 'Inbound', 'Central', 'Bangkok') RETURNING id`,
      [sourceCode, sourceName]
    );
    const { rows: targetRows } = await query(
      `INSERT INTO stations (code, name, station_type, highway_no, direction, region, province)
       VALUES ($1, $2, 'Type A', '9', 'Inbound', 'Central', 'Bangkok') RETURNING id`,
      [targetCode, targetName]
    );
    const sourceStationId = Number(sourceRows[0].id);
    const targetStationId = Number(targetRows[0].id);
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, quantity, min_stock, requires_sn)
       VALUES ('Transferable Bulk Asset', 10, 0, 0) RETURNING id`
    );
    const inventoryId = Number(invRows[0].id);

    const createRes = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ติดตั้งใหม่',
        project_name: 'Asset provenance test project',
        location: sourceName,
        station_id: sourceStationId,
        withdrawal_date: '2026-07-01',
        contract_reference_type: 'none',
        contract_reference_note: 'ทดสอบของเดิม',
        items: [{ inventory_id: inventoryId, quantity: 4, serial_numbers: [] }],
      });
    expect(createRes.statusCode).toEqual(201);

    const detailsRes = await request(app)
      .get(`/api/stations/details?station_id=${sourceStationId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailsRes.statusCode).toEqual(200);
    expect(detailsRes.body.assets[0]).toMatchObject({ inventory_id: inventoryId, current_quantity: 4 });
    expect(detailsRes.body.assets[0].source_lots[0]).toMatchObject({
      quantity_remaining: 4,
      project_name_snapshot: 'Asset provenance test project',
    });

    const moveRes = await request(app)
      .post(`/api/stations/${sourceStationId}/assets/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ inventory_id: inventoryId, quantity: 2, to_station_id: targetStationId, note: 'ทดสอบย้ายสถานี' });
    expect(moveRes.statusCode).toEqual(200);

    const balances = await query(
      `SELECT station_id, quantity FROM station_inventory WHERE inventory_id = $1 ORDER BY station_id`,
      [inventoryId]
    );
    expect(balances.rows.map(row => [Number(row.station_id), Number(row.quantity)])).toEqual([
      [sourceStationId, 2],
      [targetStationId, 2],
    ]);

    const { rows: eventRows } = await query(
      `SELECT event_type, project_name_snapshot FROM station_asset_events
       WHERE inventory_id = $1 AND to_station_id = $2 ORDER BY id DESC LIMIT 1`,
      [inventoryId, targetStationId]
    );
    expect(eventRows[0]).toMatchObject({ event_type: 'TRANSFER', project_name_snapshot: 'Asset provenance test project' });
  });

  // Test 3 & 4: Create/complete repair/claim must change/restore instance status
  it('should change and restore instance status during repair lifecycle', async () => {
    // 1. Create a new In Stock instance
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, model, quantity, min_stock, requires_sn) VALUES ('Repair Test Device', 'Model R', 1, 10, 1) RETURNING id`
    );
    const invId = Number(invRows[0].id);

    const repairSerial = 'SN-REPAIR-FLOW-' + Math.random().toString(36).substring(7);
    const { rows: instRows } = await query(
      `INSERT INTO inventory_instances (inventory_id, serial_number, condition, status) VALUES ($1, $2, 'New', 'Withdrawn') RETURNING id`,
      [invId, repairSerial]
    );
    const instId = Number(instRows[0].id);

    // 2. Create Repair via API
    const createRes = await request(app)
      .post('/api/repairs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        device_name: 'Repair Test Device',
        problem: 'Faulty screen',
        instance_id: instId,
        inventory_id: invId,
        location: 'Station Alpha'
      });
    expect(createRes.statusCode).toEqual(201);
    const repairId = createRes.body.id;

    // Verify instance status changed to "Under Repair"
    const { rows: afterCreateRows } = await query(`SELECT status FROM inventory_instances WHERE id = $1`, [instId]);
    expect(afterCreateRows[0].status).toEqual('Under Repair');

    // 3. Complete Repair via API (update status to เสร็จสิ้น)
    const updateRes = await request(app)
      .patch(`/api/repairs/${repairId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'เสร็จสิ้น',
        repair_note: 'Fixed the screen connector'
      });
    expect(updateRes.statusCode).toEqual(200);

    // Verify instance status restored to "Withdrawn"
    const { rows: afterCompleteRows } = await query(`SELECT status FROM inventory_instances WHERE id = $1`, [instId]);
    expect(afterCompleteRows[0].status).toEqual('Withdrawn');
  });

  // Test 5: PO status flow Draft -> Pending -> Approved -> Ordered -> Received
  it('should transition purchase order status correctly and receive inventory', async () => {
    // 1. Insert a mock inventory item
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, model, quantity, min_stock, requires_sn) VALUES ('PO Flow Device', 'Model P', 5, 10, 0) RETURNING id`
    );
    const invId = Number(invRows[0].id);

    // 2. Create PO in Draft status
    const createPoRes = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ordered_by: 'Test Buyer',
        project_name: 'Test Project',
        company_name: 'Vendor X',
        status: 'Draft',
        items: [
          { inventory_id: invId, quantity: 10 }
        ]
      });
    expect(createPoRes.statusCode).toEqual(201);
    const poId = createPoRes.body.id;

    // Verify Draft status
    const getStatus = async () => (await query(`SELECT status FROM purchase_orders WHERE id = $1`, [poId])).rows[0];
    let po = await getStatus();
    expect(po.status).toEqual('Draft');

    // 3. Transition to Pending
    let updatePoRes = await request(app)
      .patch(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Pending' });
    expect(updatePoRes.statusCode).toEqual(200);

    po = await getStatus();
    expect(po.status).toEqual('Pending');

    // 4. Transition to Approved
    updatePoRes = await request(app)
      .patch(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Approved' });
    expect(updatePoRes.statusCode).toEqual(200);

    po = await getStatus();
    expect(po.status).toEqual('Approved');

    // 5. Transition to Ordered
    updatePoRes = await request(app)
      .patch(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Ordered' });
    if (updatePoRes.statusCode !== 200) {
      console.log('TRANSITION TO ORDERED FAILED:', updatePoRes.body);
    }
    expect(updatePoRes.statusCode).toEqual(200);

    po = await getStatus();
    expect(po.status).toEqual('Ordered');

    // 6. Receive Goods (Receive PO) -> changes status to Received and increases inventory quantity
    const receiveRes = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { inventory_id: invId, received_quantity: 10 }
        ]
      });
    expect(receiveRes.statusCode).toEqual(200);

    // Verify PO status is Received
    po = await getStatus();
    expect(po.status).toEqual('Received');

    // Verify inventory quantity increased: 5 + 10 = 15
    const { rows: qtyRows } = await query(`SELECT quantity FROM inventory WHERE id = $1`, [invId]);
    expect(qtyRows[0].quantity).toEqual(15);
  });
});
