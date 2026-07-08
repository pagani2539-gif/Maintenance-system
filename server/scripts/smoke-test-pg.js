// One-off smoke test for Stage 2 controller rewrites against local Postgres dev DB.
// Not part of the app — run manually: DATABASE_URL=... node scripts/smoke-test-pg.js
const { query, pool } = require('../database/db');

function mockRes(label) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) {
      const ok = this.statusCode < 400;
      console.log(`${ok ? 'OK  ' : 'FAIL'} [${label}] (${this.statusCode})`, JSON.stringify(body).slice(0, 300));
      if (!ok) process.exitCode = 1;
      return body;
    },
    download(filePath, filename) { console.log(`OK   [${label}] download`, filename); }
  };
  return res;
}

async function run() {
  console.log('--- Cleaning previous smoke-test data ---');
  await query("DELETE FROM repairs WHERE ticket_no LIKE 'SMOKE-%'");
  await query("DELETE FROM withdrawals WHERE recipient = 'SmokeTester'");
  await query("DELETE FROM inventory WHERE name = 'SmokeTest Camera'");
  await query("DELETE FROM stations WHERE code = 'SMOKE-STN'");
  await query("DELETE FROM users WHERE username = 'smoketester'");

  const auth = require('../controllers/auth');
  const users = require('../controllers/users');
  const stations = require('../controllers/stations');
  const inventory = require('../controllers/inventory');
  const contracts = require('../controllers/contracts');
  const repairs = require('../controllers/repairs');
  const withdrawals = require('../controllers/withdrawals');
  const search = require('../controllers/search');
  const settings = require('../controllers/settings');
  const purchaseOrders = require('../controllers/purchaseOrders');

  // 1. Create a test admin user directly (bypass auth.create which requires req.user)
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('testpass123', 10);
  const { rows: userRows } = await query(
    `INSERT INTO users (username, password_hash, full_name, is_full, permissions) VALUES ($1,$2,$3,1,'{}') RETURNING id`,
    ['smoketester', hash, 'Smoke Tester']
  );
  const testUser = { id: userRows[0].id, full_name: 'Smoke Tester', is_full: true, permissions: {} };
  console.log('OK   [seed] created test user', testUser.id);

  // 2. auth.login
  await auth.login({ body: { username: 'smoketester', password: 'testpass123' } }, mockRes('auth.login'));

  // 3. users.list
  await users.list({ user: testUser }, mockRes('users.list'));

  // 4. stations.createStation
  const stationRes = mockRes('stations.createStation');
  await stations.createStation({
    body: { name: 'ด่านทดสอบ Smoke', station_type: 'toll', highway_no: '7', direction: 'BOTH', region: 'ภาคกลาง', province: 'ชลบุรี', responsible_person: 'ทดสอบ' },
    user: testUser
  }, stationRes);

  const { rows: stationRows } = await query("SELECT id, name FROM stations WHERE name = 'ด่านทดสอบ Smoke'");
  const stationId = stationRows[0].id;
  await query("UPDATE stations SET code = 'SMOKE-STN' WHERE id = $1", [stationId]);

  // 5. stations.getStationDetails
  await stations.getStationDetails({ query: { station_id: stationId } }, mockRes('stations.getStationDetails'));

  // 6. inventory.createItem (no file)
  const invRes = mockRes('inventory.createItem');
  await inventory.createItem({
    body: { name: 'SmokeTest Camera', model: 'X100', description: 'test', quantity: '10', min_stock: '2', requires_sn: '1', storage_location: 'A1', serial_numbers: JSON.stringify(['SMOKE-SN-1', 'SMOKE-SN-2']) },
    file: null
  }, invRes);

  const { rows: invRows } = await query("SELECT id FROM inventory WHERE name = 'SmokeTest Camera'");
  const inventoryId = invRows[0].id;

  // 7. inventory.getAllItems / getStats / getInstancesInStock
  await inventory.getAllItems({ query: {} }, mockRes('inventory.getAllItems'));
  await inventory.getStats({}, mockRes('inventory.getStats'));
  await inventory.getInstancesInStock({ params: { id: inventoryId } }, mockRes('inventory.getInstancesInStock'));

  // 8. contracts.createContract
  const contractRes = mockRes('contracts.createContract');
  await contracts.createContract({ body: { contract_no: 'SMOKE-CT-1', name: 'สัญญาทดสอบ', year_be: 2569 }, user: testUser }, contractRes);
  await contracts.getAllContracts({ query: {} }, mockRes('contracts.getAllContracts'));

  // 9. repairs.createRepair + dashboard
  const repairRes = mockRes('repairs.createRepair');
  await repairs.createRepair({
    body: { location: null, station_id: stationId, device_name: 'กล้อง', problem: 'ทดสอบ', priority: 'ปกติ' },
    user: testUser,
    files: []
  }, repairRes);
  await repairs.getDashboardStats({ query: {} }, mockRes('repairs.getDashboardStats'));
  await repairs.getAllRepairs({ query: {} }, mockRes('repairs.getAllRepairs'));
  await repairs.getStats({}, mockRes('repairs.getStats'));
  await repairs.getUnreadCount({}, mockRes('repairs.getUnreadCount'));

  // 10. withdrawals.createWithdrawal (with S/N + bulk qty mix)
  const wdRes = mockRes('withdrawals.createWithdrawal');
  await withdrawals.createWithdrawal({
    body: {
      type: 'ทดสอบ', note: 'smoke test', station_id: stationId,
      items: [{ inventory_id: inventoryId, quantity: 3, serial_numbers: ['SMOKE-SN-1', 'SMOKE-SN-2'] }]
    },
    user: { full_name: 'SmokeTester' }
  }, wdRes);

  await withdrawals.getAllWithdrawals({}, mockRes('withdrawals.getAllWithdrawals'));

  // 11. search.globalSearch
  await search.globalSearch({ query: { q: 'Smoke' } }, mockRes('search.globalSearch'));

  // 12. settings companies/system settings
  await settings.getCompanies({}, mockRes('settings.getCompanies'));
  await settings.getSystemSettings({ user: testUser }, mockRes('settings.getSystemSettings'));
  await settings.updateSystemSettings({ body: { line_token_repair: 'test-token' } }, mockRes('settings.updateSystemSettings'));

  // 13. purchaseOrders
  const poRes = mockRes('purchaseOrders.createPO');
  await purchaseOrders.createPO({
    body: { note: 'smoke po', items: [{ inventory_id: inventoryId, quantity: 5 }], created_by: 'SmokeTester' }
  }, poRes);
  await purchaseOrders.getAllPOs({ query: {} }, mockRes('purchaseOrders.getAllPOs'));
  await purchaseOrders.getVendors({}, mockRes('purchaseOrders.getVendors'));

  console.log('\n--- Cleaning up smoke-test data ---');
  await query("DELETE FROM purchase_orders WHERE note = 'smoke po'");
  await query("DELETE FROM withdrawals WHERE recipient = 'SmokeTester'");
  await query("DELETE FROM repairs WHERE device_name = 'กล้อง' AND problem = 'ทดสอบ'");
  await query("DELETE FROM contracts WHERE contract_no = 'SMOKE-CT-1'");
  await query("DELETE FROM inventory WHERE name = 'SmokeTest Camera'");
  await query("DELETE FROM stations WHERE code = 'SMOKE-STN'");
  await query("DELETE FROM users WHERE username = 'smoketester'");
  await query("DELETE FROM system_settings WHERE key = 'line_token_repair'");

  console.log('\nSMOKE TEST COMPLETE');
}

run()
  .catch((err) => {
    console.error('SMOKE TEST CRASHED:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
