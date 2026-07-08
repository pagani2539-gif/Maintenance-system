/**
 * Demo seed: 1 station + 50 inventory items + 20 mixed activities
 * Run: node scripts/seed_demo.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Spread dates across last 60 days for realistic activity feed
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(rand(8, 18), rand(0, 59), 0, 0);
  return d.toISOString();
};

// ====================================================================
// 1 STATION
// ====================================================================
const STATION = {
  code: 'STN-1-BOTH',
  name: 'ด่านชั่งน้ำหนักบางปะอิน',
  station_type: 'WEIGH_STATION',
  highway_no: '1',
  direction: 'BOTH',
  region: 'ภาคกลาง',
  province: 'พระนครศรีอยุธยา'
};

const AREAS = [
  'ช่องทางชั่งน้ำหนักหลัก',
  'ห้องควบคุมระบบคอมพิวเตอร์',
  'ลูปตรวจจับโลหะ ช่องทางที่ 1',
  'กล้อง ANPR (ทางเข้า)'
];

// ====================================================================
// 50 INVENTORY ITEMS
// ====================================================================
const INVENTORY = [
  // Computer & peripherals (15)
  ['Mouse USB Logitech', 'B100', 'เมาส์ USB สำหรับห้องควบคุม', 45, 10, 0, 'คลังกลาง / ชั้น A1'],
  ['Keyboard USB Dell', 'KB216', 'คีย์บอร์ดสำหรับ Workstation', 30, 8, 0, 'คลังกลาง / ชั้น A1'],
  ['Monitor 24" Dell', 'P2419H', 'จอแสดงผลห้องควบคุม', 12, 4, 1, 'คลังกลาง / ชั้น A2'],
  ['Webcam Logitech C920', 'C920', 'กล้องประชุม', 6, 2, 1, 'คลังกลาง / ชั้น A1'],
  ['Headset Logitech H390', 'H390', 'หูฟังพนักงาน', 18, 5, 0, 'คลังกลาง / ชั้น A1'],
  ['USB Hub 4-port', 'UH4', 'อุปกรณ์ต่อพ่วง USB', 25, 6, 0, 'คลังกลาง / ชั้น A1'],
  ['USB Cable Type-A 1.5m', 'UC15', 'สาย USB', 60, 15, 0, 'คลังกลาง / ชั้น B1'],
  ['HDMI Cable 2m', 'HD2M', 'สาย HDMI', 35, 10, 0, 'คลังกลาง / ชั้น B1'],
  ['VGA Cable 3m', 'VG3M', 'สาย VGA สำรอง', 15, 5, 0, 'คลังกลาง / ชั้น B1'],
  ['Power Strip 6-outlet', 'PS6', 'ปลั๊กรางสำหรับห้องควบคุม', 22, 8, 0, 'คลังกลาง / ชั้น A3'],
  ['SSD 500GB Kingston', 'A400-500', 'ที่เก็บข้อมูล SSD', 14, 4, 1, 'คลังกลาง / ชั้น C1'],
  ['HDD 2TB WD Blue', 'WD20EZAZ', 'ฮาร์ดดิสก์สำรอง', 10, 3, 1, 'คลังกลาง / ชั้น C1'],
  ['RAM DDR4 8GB Kingston', 'KVR26N19S8/8', 'หน่วยความจำ', 28, 8, 0, 'คลังกลาง / ชั้น C2'],
  ['Workstation Dell OptiPlex 7090', '7090MT', 'คอมพิวเตอร์ห้องควบคุม', 4, 2, 1, 'คลังกลาง / ห้อง C'],
  ['Printer HP LaserJet Pro M404n', 'M404n', 'เครื่องพิมพ์เอกสาร', 2, 1, 1, 'ห้องธุรการ'],

  // Network gear (12)
  ['Switch Cisco 24-port', 'C1000-24P', 'สวิตช์เครือข่ายหลัก', 5, 2, 1, 'ตู้ Rack ห้องควบคุม'],
  ['Router Mikrotik RB4011', 'RB4011iGS', 'เราเตอร์ขอบ', 3, 1, 1, 'ตู้ Rack ห้องควบคุม'],
  ['Access Point Ubiquiti AC Pro', 'UAP-AC-PRO', 'AP กระจายสัญญาณ', 8, 3, 1, 'คลังกลาง / ชั้น D1'],
  ['Cable RJ45 Cat6 (305m roll)', 'CAT6-305', 'สายแลนสำหรับเดินใหม่', 6, 2, 0, 'คลังกลาง / ห้อง D'],
  ['Fiber Optic SC-SC 10m', 'FO-10', 'สายไฟเบอร์ขนาดสั้น', 12, 4, 0, 'คลังกลาง / ห้อง D'],
  ['Patch Panel 24-port', 'PP24', 'แผงเชื่อม Cat6', 4, 2, 0, 'คลังกลาง / ห้อง D'],
  ['Network Tester', 'NT-100', 'เครื่องทดสอบสายแลน', 2, 1, 0, 'คลังกลาง / ห้อง D'],
  ['Crimping Tool RJ45', 'CT45', 'คีมเข้าหัวสายแลน', 4, 2, 0, 'คลังกลาง / ห้อง D'],
  ['Connector RJ45 (100 pcs)', 'RJ45-100', 'หัวสายแลนสำรอง', 18, 5, 0, 'คลังกลาง / ห้อง D'],
  ['SFP Module 1Gbps SX', 'SFP-1G-SX', 'โมดูลไฟเบอร์', 6, 2, 1, 'ตู้ Rack ห้องควบคุม'],
  ['Media Converter Fiber', 'MC-FX', 'แปลงสัญญาณไฟเบอร์', 4, 2, 1, 'ตู้ Rack ห้องควบคุม'],
  ['POE Injector 30W', 'POE-30W', 'จ่ายไฟผ่านสายแลน', 9, 3, 0, 'คลังกลาง / ห้อง D'],

  // Power equipment (8)
  ['UPS 1000VA APC', 'BV1000I-MS', 'UPS สำรองไฟห้องควบคุม', 8, 3, 1, 'ห้อง UPS'],
  ['UPS 3000VA APC', 'SRT3000XLI', 'UPS Online สำหรับ Server', 3, 1, 1, 'ห้อง UPS'],
  ['Battery 12V 7Ah', 'B12-7', 'แบตเตอรี่สำรองสำหรับ UPS', 24, 8, 0, 'ห้อง UPS'],
  ['Surge Protector 6-outlet', 'SP6', 'อุปกรณ์ป้องกันไฟกระชาก', 14, 4, 0, 'คลังกลาง / ชั้น A3'],
  ['Power Supply ATX 600W', 'PS-600W', 'พาวเวอร์ซัพพลาย', 5, 2, 0, 'คลังกลาง / ชั้น C2'],
  ['Extension Cord 5m', 'EC-5', 'สายไฟยาว', 16, 5, 0, 'คลังกลาง / ชั้น A3'],
  ['Voltage Stabilizer 1500W', 'VS-1500', 'เครื่องปรับแรงดันไฟฟ้า', 4, 2, 1, 'ห้อง UPS'],
  ['Power Meter Clamp', 'PM-C1', 'มิเตอร์วัดกระแสไฟ', 2, 1, 0, 'คลังกลาง / ชั้น D2'],

  // WIM / Field equipment (10)
  ['Weight Sensor Strain Gauge', 'WS-SG-30', 'เซ็นเซอร์ชั่งน้ำหนัก', 4, 2, 1, 'ห้องอุปกรณ์ภาคสนาม'],
  ['Inductive Loop Sensor', 'ILS-2M', 'ลูปตรวจจับโลหะ', 6, 2, 1, 'ห้องอุปกรณ์ภาคสนาม'],
  ['ANPR Camera Hikvision', 'DS-2CD7A26G0', 'กล้องอ่านป้ายทะเบียน', 5, 2, 1, 'ห้องอุปกรณ์ภาคสนาม'],
  ['Traffic Speed Gun', 'TSG-100', 'เครื่องวัดความเร็วรถ', 2, 1, 1, 'ห้องอุปกรณ์ภาคสนาม'],
  ['LED Variable Message Sign', 'VMS-32x96', 'ป้ายข้อความแสดงผล LED', 2, 1, 1, 'ห้องอุปกรณ์ภาคสนาม'],
  ['Traffic Loop Detector Card', 'TLD-2CH', 'การ์ดตรวจจับลูปจราจร', 5, 2, 0, 'คลังกลาง / ห้อง D'],
  ['IP Camera Outdoor 4MP', 'IPCAM-4MP', 'กล้องวงจรปิดกลางแจ้ง', 7, 3, 1, 'คลังกลาง / ห้อง E'],
  ['DVR/NVR 16-channel', 'NVR-16', 'เครื่องบันทึก CCTV', 2, 1, 1, 'ห้องอุปกรณ์ภาคสนาม'],
  ['Sound Level Meter', 'SLM-3', 'เครื่องวัดเสียง', 1, 1, 0, 'คลังกลาง / ห้อง E'],
  ['Multimeter Digital Fluke 117', 'F117', 'มัลติมิเตอร์', 3, 1, 0, 'ห้องอุปกรณ์ภาคสนาม'],

  // Consumables (5)
  ['Electrical Tape (10 rolls)', 'ET-10', 'เทปพันสายไฟ', 30, 8, 0, 'คลังกลาง / ชั้น B2'],
  ['Cable Ties 200mm (100 pcs)', 'CT200', 'เคเบิลไทร์', 50, 10, 0, 'คลังกลาง / ชั้น B2'],
  ['Cleaning Kit IT Equipment', 'CK-IT', 'ชุดทำความสะอาดอุปกรณ์', 8, 3, 0, 'คลังกลาง / ชั้น B2'],
  ['Thermal Paste CPU', 'TP-CPU', 'ซิลิโคนพัดลม CPU', 12, 4, 0, 'คลังกลาง / ชั้น C2'],
  ['Spray Compressed Air 400ml', 'SCA-400', 'สเปรย์เป่าฝุ่น', 14, 4, 0, 'คลังกลาง / ชั้น B2']
];

// ====================================================================
// 20 ACTIVITIES — spread by date for realistic timeline
// ====================================================================
// 6 repairs + 3 claims + 7 withdrawals + 2 returns + 2 POs = 20

const REPAIRS = [
  // [device_name, problem, priority, status, days_ago, reporter, project]
  ['UPS 1000VA APC', 'ไฟดับ ระบบสำรองไฟไม่ทำงาน แบตเตอรี่อาจเสื่อม', 'วิกฤต', 'รอดำเนินการ', 1, 'วรวุฒิ สิทธิชัย', 'บำรุงรักษาประจำเดือน'],
  ['Switch Cisco 24-port', 'พอร์ตที่ 12-16 ไม่ทำงาน ไฟไม่ติด', 'ด่วนมาก', 'กำลังซ่อม', 3, 'สมศักดิ์ แข็งแรง', 'ตรวจสอบเครือข่าย Q2'],
  ['ANPR Camera Hikvision', 'กล้องเลนส์เบลอ ภาพไม่ชัด ทำงานผิดพลาด', 'ด่วน', 'รออะไหล่', 7, 'ปิติ ยินดี', 'บำรุงรักษาประจำเดือน'],
  ['Workstation Dell OptiPlex 7090', 'เปิดไม่ติด พัดลมหมุนแต่ไม่ขึ้นจอ', 'ด่วน', 'เสร็จสิ้น', 14, 'วิชัย มานะ', 'ซ่อมเครื่องประจำห้องควบคุม'],
  ['Printer HP LaserJet Pro M404n', 'พิมพ์ติดกระดาษบ่อย', 'ปกติ', 'เสร็จสิ้น', 22, 'สุดา รักดี', null],
  ['Monitor 24" Dell', 'จอกระพริบ มีเส้นขีดแนวตั้ง', 'ปกติ', 'เสร็จสิ้น', 35, 'วรวุฒิ สิทธิชัย', null]
];

const CLAIMS = [
  ['Router Mikrotik RB4011', 'พังในช่วงประกัน ไฟล์ Firmware เสีย ไม่สามารถ boot ได้', 'ด่วน', 'รอดำเนินการ', 2, 'สมศักดิ์ แข็งแรง', 'เคลมประกัน'],
  ['UPS 3000VA APC', 'จอ LCD แสดงผลแปลกๆ Error U99', 'ด่วนมาก', 'กำลังซ่อม', 5, 'ปิติ ยินดี', 'เคลมประกัน'],
  ['Workstation Dell OptiPlex 7090', 'SSD ภายในมีปัญหา ระบบบูตช้ามาก', 'ปกติ', 'เสร็จสิ้น', 28, 'วรวุฒิ สิทธิชัย', 'เคลมประกันต่อ Dell']
];

// withdrawal_subtypes
const WITHDRAWALS = [
  // [recipient, type, items[{name, qty}], days_ago, project, note]
  ['สมศักดิ์ แข็งแรง', 'ติดตั้งใหม่', [['Switch Cisco 24-port', 1], ['Cable RJ45 Cat6 (305m roll)', 1], ['Connector RJ45 (100 pcs)', 1]], 4, 'ขยายเครือข่ายห้องควบคุม', 'สำหรับ rack ใหม่'],
  ['ปิติ ยินดี', 'สำรองใช้งาน', [['UPS 1000VA APC', 2]], 6, 'สำรองในกรณีพังฉุกเฉิน', 'ใช้สำรองที่ห้องอุปกรณ์'],
  ['วรวุฒิ สิทธิชัย', 'ทดสอบ', [['Network Tester', 1]], 8, 'ทดสอบสายแลนชั้น 2', 'คืนภายใน 30 วัน'],
  ['วิชัย มานะ', 'ซ่อมแซม', [['RAM DDR4 8GB Kingston', 2], ['Thermal Paste CPU', 1]], 11, 'อัปเกรด workstation', null],
  ['สมศักดิ์ แข็งแรง', 'ติดตั้งใหม่', [['IP Camera Outdoor 4MP', 2], ['POE Injector 30W', 2]], 15, 'ติดตั้งกล้องเพิ่ม', 'จุดที่ 3 และ 4'],
  ['ปิติ ยินดี', 'ทดสอบ', [['Multimeter Digital Fluke 117', 1]], 18, 'ทดสอบไฟ ANPR', 'คืนภายใน 7 วัน'],
  ['สุดา รักดี', 'อื่นๆ', [['Mouse USB Logitech', 1], ['Keyboard USB Dell', 1]], 25, 'เปลี่ยนทดแทนของพัง', 'custom subtype: เปลี่ยนทดแทน']
];

// Returns reference withdrawals by index (0-based in WITHDRAWALS)
const RETURNS = [
  // [withdrawal_index, user_name, condition, days_ago, note]
  [2, 'วรวุฒิ สิทธิชัย', 'Good', 3, 'ทดสอบเสร็จเรียบร้อย คืนสภาพดี'],   // Returns "ทดสอบ" Network Tester
  [5, 'ปิติ ยินดี', 'Good', 12, 'ทดสอบครบแล้ว']                          // Returns "ทดสอบ" Multimeter
];

const POS = [
  // [po_no, company, ordered_by, item_names[], status, days_ago, note]
  ['PO-AUTO-001', 'บริษัท ไอที สมาร์ท จำกัด', 'System', ['Mouse USB Logitech', 'Keyboard USB Dell'], 'Draft', 2, 'สร้างอัตโนมัติ - สต็อกต่ำ'],
  ['PO-MNL-001', 'บริษัท เน็ตเวิร์ค โปร จำกัด', 'วรวุฒิ สิทธิชัย', ['Switch Cisco 24-port', 'Cable RJ45 Cat6 (305m roll)'], 'Received', 10, 'รับเรียบร้อย ส่งเข้าห้องควบคุม']
];

// ====================================================================
// SEED EXECUTION
// ====================================================================
async function main() {
  console.log('🌱 เริ่ม seed ข้อมูลจำลอง...\n');

  await run('PRAGMA foreign_keys = OFF');

  // 1. STATION — ใช้ที่มีอยู่ หรือสร้างใหม่
  const existingStation = await get('SELECT id, name FROM stations WHERE id = 1');
  let stationName;
  if (existingStation) {
    console.log(`📍 ใช้สถานีที่มีอยู่: "${existingStation.name}" (id=1)`);
    stationName = existingStation.name;
  } else {
    console.log('📍 สร้างสถานีใหม่...');
    await run(
      `INSERT INTO stations (id, code, name, station_type, highway_no, direction, region, province) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, STATION.code, STATION.name, STATION.station_type, STATION.highway_no, STATION.direction, STATION.region, STATION.province]
    );
    stationName = STATION.name;
  }

  // เพิ่ม areas ถ้ายังไม่มี
  const existingAreas = await new Promise((res, rej) => db.all('SELECT id, name FROM station_areas WHERE station_id = 1', (e, rows) => e ? rej(e) : res(rows)));
  if (existingAreas.length === 0) {
    for (const areaName of AREAS) {
      await run('INSERT INTO station_areas (station_id, name) VALUES (?, ?)', [1, areaName]);
    }
  }
  const areas = await new Promise((res, rej) => db.all('SELECT id, name FROM station_areas WHERE station_id = 1', (e, rows) => e ? rej(e) : res(rows)));
  console.log(`   ✓ พื้นที่ย่อย ${areas.length} จุด`);

  // 2. INVENTORY
  console.log('\n📦 สร้างอุปกรณ์ 50 รายการ...');
  for (const [name, model, description, qty, minStock, requiresSn, storage] of INVENTORY) {
    await run(
      `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, model, description, qty, minStock, requiresSn, storage]
    );
  }
  console.log(`   ✓ ${INVENTORY.length} รายการ`);

  // 3. REPAIRS + CLAIMS
  console.log('\n🔧 สร้างงานซ่อม 6 + งานเคลม 3...');
  let ticketCounter = 1;
  for (const [device, problem, priority, status, ago, reporter, project] of REPAIRS) {
    const ticketNo = `TKR-${String(ticketCounter++).padStart(6, '0')}`;
    const area = pick(areas);
    const createdAt = daysAgo(ago);
    await run(
      `INSERT INTO repairs (ticket_no, reporter, location, station_id, station_area_id, device_name, problem, priority, status, type, received_at, project_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNo, reporter, stationName, 1, area.id, device, problem, priority, status, 'repair', createdAt, project, createdAt]
    );
  }
  for (const [device, problem, priority, status, ago, reporter, project] of CLAIMS) {
    const ticketNo = `CLM-${String(ticketCounter++).padStart(6, '0')}`;
    const area = pick(areas);
    const createdAt = daysAgo(ago);
    await run(
      `INSERT INTO repairs (ticket_no, reporter, location, station_id, station_area_id, device_name, problem, priority, status, type, received_at, project_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNo, reporter, stationName, 1, area.id, device, problem, priority, status, 'claim', createdAt, project, createdAt]
    );
  }
  console.log(`   ✓ ${REPAIRS.length} repairs + ${CLAIMS.length} claims`);

  // 4. WITHDRAWALS + items + transactions
  console.log('\n📤 สร้างการเบิก 7 รายการ + transactions...');
  const wdIds = [];
  for (const [recipient, type, items, ago, project, note] of WITHDRAWALS) {
    const createdAt = daysAgo(ago);
    const area = pick(areas);
    const wdResult = await run(
      `INSERT INTO withdrawals (recipient, type, note, project_name, location, station_id, station_area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipient, type, note, project, stationName, 1, area.id, createdAt]
    );
    const wdId = wdResult.lastID;
    wdIds.push(wdId);

    for (const [itemName, qty] of items) {
      const invRow = await get('SELECT id FROM inventory WHERE name = ?', [itemName]);
      if (!invRow) continue;

      await run(
        `INSERT INTO withdrawal_items (withdrawal_id, inventory_id, quantity) VALUES (?, ?, ?)`,
        [wdId, invRow.id, qty]
      );
      await run('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [qty, invRow.id]);
      await run(
        `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_withdrawn, project_name, location, station_id, user_name, note, withdrawal_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invRow.id, 'WITHDRAW', qty, project, stationName, 1, recipient, note, wdId, createdAt]
      );
    }
  }
  console.log(`   ✓ ${WITHDRAWALS.length} withdrawals + auto transactions`);

  // 5. RETURNS — find the WITHDRAW transactions and create RETURN
  console.log('\n📥 สร้างการคืน 2 รายการ...');
  for (const [wdIdx, userName, condition, ago, note] of RETURNS) {
    const wdId = wdIds[wdIdx];
    const items = await new Promise((res, rej) => db.all('SELECT * FROM withdrawal_items WHERE withdrawal_id = ?', [wdId], (e, rows) => e ? rej(e) : res(rows)));
    const createdAt = daysAgo(ago);

    for (const item of items) {
      // Mark original WITHDRAW transaction as RETURNED
      await run(
        `UPDATE inventory_transactions SET status = 'RETURNED' WHERE withdrawal_id = ? AND inventory_id = ?`,
        [wdId, item.inventory_id]
      );

      // Create RETURN transaction with inherited station_id
      await run(
        `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_returned, station_id, location, user_name, note, withdrawal_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.inventory_id, 'RETURN', item.quantity, 1, stationName, userName, note, wdId, createdAt]
      );
      await run('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.inventory_id]);
    }
  }
  console.log(`   ✓ ${RETURNS.length} returns`);

  // 6. PURCHASE ORDERS
  console.log('\n📋 สร้างใบสั่งซื้อ 2 ใบ...');
  for (const [poNo, company, orderedBy, itemNames, status, ago, note] of POS) {
    const createdAt = daysAgo(ago);
    const poResult = await run(
      `INSERT INTO purchase_orders (po_no, company_name, ordered_by, created_by, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [poNo, company, orderedBy, orderedBy === 'System' ? 'System' : 'Manual', note, status, createdAt, createdAt]
    );
    const poId = poResult.lastID;
    for (const itemName of itemNames) {
      const invRow = await get('SELECT id, quantity, min_stock FROM inventory WHERE name = ?', [itemName]);
      if (!invRow) continue;
      const orderQty = Math.max(invRow.min_stock * 2 - invRow.quantity, 10);
      await run(
        `INSERT INTO purchase_order_items (po_id, inventory_id, quantity, received_quantity) VALUES (?, ?, ?, ?)`,
        [poId, invRow.id, orderQty, status === 'Received' ? orderQty : 0]
      );
      if (status === 'Received') {
        await run('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [orderQty, invRow.id]);
        await run(
          `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note, created_at) VALUES (?, ?, ?, ?, ?)`,
          [invRow.id, 'ADD_STOCK', orderQty, `รับสินค้าตามใบสั่งซื้อ ${poNo}`, createdAt]
        );
      }
    }
  }
  console.log(`   ✓ ${POS.length} purchase orders`);

  await run('PRAGMA foreign_keys = ON');

  // SUMMARY
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const counts = {};
  for (const t of ['stations', 'station_areas', 'inventory', 'repairs', 'withdrawals', 'withdrawal_items', 'inventory_transactions', 'purchase_orders', 'purchase_order_items']) {
    const r = await get(`SELECT COUNT(*) as c FROM ${t}`);
    counts[t] = r.c;
  }
  console.log('📊 สรุปข้อมูลที่ seed:');
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${String(v).padStart(4)} ${k}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ seed เสร็จเรียบร้อย!\n');

  db.close();
}

main().catch(err => {
  console.error('❌ Error:', err);
  db.close();
  process.exit(1);
});
