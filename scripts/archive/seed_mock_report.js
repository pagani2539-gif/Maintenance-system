/**
 * Comprehensive Seeder: Populates realistic WIM-themed data
 * Run: node scripts/seed_mock_report.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

const THAI_NAMES = [
  'สมชาย ใจดี', 'สมหญิง รักเรียน', 'วิชัย มานะ', 'มานี ชูใจ', 'ปิติ ยินดี', 
  'ชูใจ สายเสมอ', 'สมศักดิ์ แข็งแรง', 'กิตติ มั่งมี', 'ภานุ วัฒนพงศ์', 
  'วรวุฒิ สิทธิชัย', 'ศิริพร อารีย์', 'รัตนา สุขสันต์', 'ฉัตรชัย พรประสิทธิ์',
  'ไพโรจน์ เรืองเดช', 'ดนัย เกียรติเกรียงไกร', 'วรรณวิภา ศรีสุข', 'นภา วงศ์สว่าง'
];

const COMPANIES = [
  'บริษัท ไอที โซลูชั่น แอนด์ เซอร์วิส จำกัด',
  'บริษัท เน็ตเวิร์ค ซิสเต็มส์ คอร์ปอเรชัน จำกัด',
  'บริษัท ดิจิทัล ซัพพลาย แอนด์ เทรดดิ้ง จำกัด',
  'บริษัท พาวเวอร์ แอนด์ อินสตรูเมนท์ เทคโนโลยี จำกัด'
];

const PROJECTS = [
  'โครงการเพิ่มประสิทธิภาพระบบชั่งน้ำหนัก WIM ปี 2569',
  'งานซ่อมบำรุงรักษาอุปกรณ์สถานีตรวจสอบน้ำหนักประจำปี',
  'โครงการขยายช่องทางชั่งน้ำหนักพิเศษ',
  'ระบบตรวจจับยานพาหนะและควบคุมสัญญาณไฟจราจรอัตโนมัติ',
  'โครงการจัดซื้ออุปกรณ์คอมพิวเตอร์และเครือข่ายทดแทน'
];

const WIM_DEVICES = [
  'WIM Workstation Computer',
  'Quartz WIM Sensor',
  'ANPR Camera',
  'Industrial PoE Switch 8-Port',
  'Core Switch 24-Port',
  'MikroTik Router',
  'UPS 1000VA',
  'UPS 3000VA Online',
  'Loop Detector Card',
  'NVR 16-Channel',
  'IP Camera 4MP',
  'Monitor LED 24"',
  'Laser Printer',
  'SFP Module',
  'Industrial Power Supply 24V',
  'LED VMS Board',
  'Digital Multimeter',
  'Cable Tester'
];

const PROBLEMS = [
  'เปิดไม่ติดเนื่องจากระบบจ่ายไฟขัดข้อง',
  'กล้องไม่ส่งภาพสัญญาณหน้างานขัดข้อง',
  'เซนเซอร์ WIM วัดค่าน้ำหนักผิดเพี้ยนเกินมาตรฐานกำหนด',
  'การ์ดลูปขัดข้อง ไม่สามารถตรวจจับโลหะและคัดกรองประเภทรถได้',
  'ระบบบูตไม่ได้ หน้าจอแสดงข้อความ Error ของระบบปฏิบัติการ',
  'พอร์ตเชื่อมต่อสายแลนเสียหายจากไฟกระชาก',
  'เครื่องสำรองไฟฟ้าส่งเสียงเตือนตลอดเวลาและไม่สำรองไฟ',
  'เครื่องพิมพ์กระดาษติดบ่อยและตลับหมึกหมดสภาพ',
  'เราเตอร์ไม่เชื่อมต่อสัญญานอินเทอร์เน็ตด่านล่ม',
  'หน้าจอแสดงผลเสื่อมสภาพ สีเพี้ยนและมีเส้นขีดหน้าจอ'
];

const INVENTORY_TEMPLATES = [
  { name: 'Quartz WIM Sensor 2m', model: 'Kistler 9195C', description: 'เซนเซอร์ตรวจจับน้ำหนักชนิดควอตซ์ความแม่นยำสูง', requires_sn: 1, min_stock: 4, category: 'WIM' },
  { name: 'ANPR Camera 4MP', model: 'Hikvision DS-2CD7A26G0', description: 'กล้องอ่านป้ายทะเบียนความละเอียดสูงสำหรับงานจราจร', requires_sn: 1, min_stock: 5, category: 'Field' },
  { name: 'Industrial Switch 8-Port', model: 'Moxa EDS-208A', description: 'สวิตช์อุตสาหกรรมทนความร้อนสูง', requires_sn: 1, min_stock: 5, category: 'Network' },
  { name: 'MikroTik Router VPN', model: 'RB5009UG+S+', description: 'เราเตอร์ควบคุมระบบเครือข่ายสาขา', requires_sn: 1, min_stock: 3, category: 'Network' },
  { name: 'Core Switch 24-Port', model: 'Cisco C1000-24P-4G', description: 'สวิตช์จัดเก็บเครือข่ายความเร็วสูง', requires_sn: 1, min_stock: 2, category: 'Network' },
  { name: 'UPS Online 1000VA', model: 'APC BV1000I-MS', description: 'เครื่องสำรองไฟฟ้าสำหรับสวิตช์และกล้อง', requires_sn: 1, min_stock: 6, category: 'Power' },
  { name: 'UPS Online 3000VA', model: 'APC SRT3000XLI', description: 'เครื่องสำรองไฟฟ้าสำหรับ Server หลักด่านชั่ง', requires_sn: 1, min_stock: 2, category: 'Power' },
  { name: 'Loop Detector Card 2CH', model: 'Nortech PD272', description: 'การ์ดลูปตรวจจับยานพาหนะแบบสองช่องสัญญาณ', requires_sn: 1, min_stock: 5, category: 'WIM' },
  { name: 'NVR 16-Channel 4K', model: 'Hikvision DS-7716NI-I4', description: 'เครื่องบันทึกภาพกล้องวงจรปิดประสิทธิภาพสูง', requires_sn: 1, min_stock: 2, category: 'Field' },
  { name: 'IP Camera Bullet 4MP', model: 'Hikvision DS-2CD2043G2-I', description: 'กล้องวงจรปิดชนิดทรงกระบอกสำหรับด่านชั่ง', requires_sn: 1, min_stock: 8, category: 'Field' },
  { name: 'Monitor LED 24"', model: 'Dell P2422H', description: 'จอแสดงผลข้อมูลสำหรับด่านชั่งน้ำหนัก', requires_sn: 1, min_stock: 6, category: 'Hardware' },
  { name: 'Laser Printer Monochrome', model: 'HP LaserJet Pro M404n', description: 'เครื่องพิมพ์เลเซอร์สำหรับรายงานเอกสารด่าน', requires_sn: 1, min_stock: 2, category: 'Hardware' },
  { name: 'SFP Module 1.25G Single-mode', model: 'MikroTik S-31DLC20D', description: 'โมดูลไฟเบอร์ออปติกระยะไกล 20 กม.', requires_sn: 0, min_stock: 15, category: 'Network' },
  { name: 'SFP Module 10G Multi-mode', model: 'MikroTik S+85DLC03D', description: 'โมดูลไฟเบอร์ออปติกความเร็วสูงระยะสั้น', requires_sn: 0, min_stock: 10, category: 'Network' },
  { name: 'Industrial Power Supply 24V', model: 'Mean Well NDR-120-24', description: 'พาวเวอร์ซัพพลายอุตสาหกรรมชนิดรางปีกนก', requires_sn: 0, min_stock: 12, category: 'Power' },
  { name: 'LED Board Control Card', model: 'VMS-Control-H1', description: 'การ์ดคอนโทรลแสดงป้ายข้อมูล LED VMS', requires_sn: 1, min_stock: 4, category: 'WIM' },
  { name: 'Digital Multimeter', model: 'Fluke 117', description: 'มัลติมิเตอร์สำหรับช่างตรวจวัดไฟฟ้าหน้างาน', requires_sn: 1, min_stock: 3, category: 'Tools' },
  { name: 'RJ45 Connector Cat6 (100 pcs)', model: 'Link US-1002', description: 'หัวแลน RJ45 มาตรฐาน Cat6', requires_sn: 0, min_stock: 10, category: 'Consumables' },
  { name: 'LAN Cable Cat6 (305m roll)', model: 'Link US-9116', description: 'สายแลน Cat6 สำหรับเชื่อมต่อเครือข่าย', requires_sn: 0, min_stock: 5, category: 'Consumables' },
  { name: 'Battery 12V 9Ah for UPS', model: 'CSB HR1234WF2', description: 'แบตเตอรี่สำรองคุณภาพสูงสำหรับเปลี่ยนใน UPS', requires_sn: 0, min_stock: 30, category: 'Power' }
];

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Generate structured dates sequentially (oldest to newest)
const generateChronologicalDates = (count, daysRange) => {
  const dates = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    // Distribute timestamps over daysRange. Larger index = newer date
    const d = new Date(now.getTime());
    const daysAgo = daysRange - ((i / (count - 1)) * daysRange);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(rand(8, 17), rand(0, 59), rand(0, 59), 0);
    dates.push(d.toISOString().replace('T', ' ').substring(0, 19));
  }
  return dates;
};

async function main() {
  console.log('🌱 เริ่มต้นกระบวนการ Seed ข้อมูลจำลองความละเอียดสูง...\n');

  // Disable FK temporarily to facilitate table truncation
  await run('PRAGMA foreign_keys = OFF');

  // 1. Clear existing data
  const tables = [
    'repair_logs', 'repair_images', 'device_changes', 'repairs',
    'inventory_transactions', 'inventory_instances', 'withdrawal_items', 'withdrawals',
    'purchase_order_items', 'purchase_orders', 'inventory'
  ];

  for (const table of tables) {
    await run(`DELETE FROM ${table}`);
    await run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
    console.log(`🧹 เคลียร์ตาราง: ${table}`);
  }

  // 2. Retrieve Stations and Areas
  const stations = await all("SELECT id, name FROM stations");
  if (stations.length === 0) {
    console.error('❌ ไม่พบสถานีในระบบ! กรุณารัน node scripts/seed_wim_stations.js ก่อน');
    process.exit(1);
  }
  
  const areas = await all("SELECT id, station_id, name FROM station_areas");
  const areasByStation = {};
  areas.forEach(a => {
    if (!areasByStation[a.station_id]) areasByStation[a.station_id] = [];
    areasByStation[a.station_id].push(a);
  });

  console.log(`📍 โหลดสถานี ${stations.length} สถานี และพื้นที่ย่อยเรียบร้อย`);

  // 3. Seed Inventory (30 Items)
  console.log('\n📦 นำเข้าอุปกรณ์สต็อกมาตรฐาน 20 รายการ...');
  const inventoryIds = [];
  
  for (const t of INVENTORY_TEMPLATES) {
    // Generate initial stock qty
    const initialQty = rand(20, 60);
    const result = await run(
      `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [t.name, t.model, t.description, initialQty, t.min_stock, t.requires_sn, `คลังกลาง / ชั้น ${t.category}`]
    );
    const invId = result.lastID;
    inventoryIds.push({ id: invId, ...t, quantity: initialQty });
    
    // Seed serial numbers if required
    if (t.requires_sn === 1) {
      for (let i = 0; i < initialQty; i++) {
        const serial = `SN-${t.category.toUpperCase()}-${invId}-${String(10000 + i).substring(1)}`;
        const condition = i % 10 === 0 ? 'New' : 'Good';
        await run(
          `INSERT INTO inventory_instances (inventory_id, serial_number, condition, status, current_location) 
           VALUES (?, ?, ?, 'In Stock', 'Warehouse')`,
          [invId, serial, condition]
        );
      }
    }
  }
  console.log(`   ✓ สร้างไอเทมคลัง ${inventoryIds.length} รายการ`);

  // 4. Seed Repairs and Claims (150 Items) in strict chronological ascending order
  console.log('\n🔧 สร้างงานซ่อมและเคลม 150 รายการ (เรียงรหัสตามเวลาจริง)...');
  const repairDates = generateChronologicalDates(150, 90); // 150 dates over 90 days
  let repairCounter = 1;
  let claimCounter = 1;

  for (let i = 0; i < 150; i++) {
    const isClaim = Math.random() < 0.3; // 30% claims, 70% repairs
    const type = isClaim ? 'claim' : 'repair';
    
    // Ticket number formats
    const ticketNo = isClaim 
      ? `CLM-${String(100000 + claimCounter++).substring(1)}` 
      : `TKR-${String(100000 + repairCounter++).substring(1)}`;

    const station = pick(stations);
    const stationAreas = areasByStation[station.id] || [];
    const area = stationAreas.length > 0 ? pick(stationAreas) : null;
    const date = repairDates[i];
    
    const device = pick(WIM_DEVICES);
    const problem = pick(PROBLEMS) + ` ในระบบด่าน ${station.name}`;
    const priority = pick(['ปกติ', 'ด่วน', 'ด่วนมาก', 'วิกฤต']);
    
    // Distribute statuses realistically
    // i close to 150 (newer items) -> likely Pending/In-progress
    // i close to 0 (older items) -> Completed
    let status = 'เสร็จสิ้น';
    if (i > 140) {
      status = pick(['รอดำเนินการ', 'กำลังซ่อม', 'รออะไหล่']);
    } else if (i > 130) {
      status = pick(['กำลังซ่อม', 'เสร็จสิ้น']);
    }
    
    const technician = status !== 'รอดำเนินการ' ? pick(THAI_NAMES) : null;
    const repairNote = status === 'เสร็จสิ้น' ? 'ดำเนินการตรวจวัด ปรับเปลี่ยนชิ้นส่วนอะไหล่ และทดสอบสัญญาณการทำงานกลับมาปกติเรียบร้อย' : null;
    const isRead = i < 135 ? 1 : 0;
    const projectName = pick(PROJECTS);

    const res = await run(
      `INSERT INTO repairs (ticket_no, reporter, location, station_id, station_area_id, device_name, problem, priority, status, technician, repair_note, is_read, type, received_at, created_at, updated_at, project_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNo, pick(THAI_NAMES), station.name, station.id, area ? area.id : null, device, problem, priority, status, technician, repairNote, isRead, type, date, date, date, projectName]
    );
    const repairId = res.lastID;

    // Add Logs
    await run(`INSERT INTO repair_logs (repair_id, action, user, note, created_at) VALUES (?, 'แจ้งปัญหา', ?, 'บันทึกใบแจ้งปัญหาเข้าระบบ', ?)`, [repairId, pick(THAI_NAMES), date]);
    if (status !== 'รอดำเนินการ') {
      const nextDate = new Date(new Date(date).getTime() + 60 * 60 * 1000 * rand(2, 24)).toISOString().replace('T', ' ').substring(0, 19);
      await run(`INSERT INTO repair_logs (repair_id, action, user, note, created_at) VALUES (?, 'รับเรื่องดำเนินการ', ?, 'มอบหมายงานให้ช่างผู้รับผิดชอบ', ?)`, [repairId, pick(THAI_NAMES), nextDate]);
      
      if (status === 'เสร็จสิ้น') {
        const completionDate = new Date(new Date(nextDate).getTime() + 60 * 60 * 1000 * rand(4, 48)).toISOString().replace('T', ' ').substring(0, 19);
        await run(`INSERT INTO repair_logs (repair_id, action, user, note, created_at) VALUES (?, 'เปลี่ยนสถานะเป็น เสร็จสิ้น', ?, ?, ?)`, [repairId, technician, repairNote, completionDate]);
      } else if (status === 'รออะไหล่') {
        const holdDate = new Date(new Date(nextDate).getTime() + 60 * 60 * 1000 * rand(2, 12)).toISOString().replace('T', ' ').substring(0, 19);
        await run(`INSERT INTO repair_logs (repair_id, action, user, note, created_at) VALUES (?, 'เปลี่ยนสถานะเป็น รออะไหล่', ?, 'รอจัดหาอะไหล่เทียบเคียงสต็อกกลาง', ?)`, [repairId, technician, holdDate]);
      }
    }

    // 15% have device changes
    if (status === 'เสร็จสิ้น' && Math.random() < 0.15) {
      await run(
        `INSERT INTO device_changes (repair_id, old_serial, old_model, new_serial, new_model, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [repairId, `SN-OLD-${rand(1000, 9999)}`, device, `SN-NEW-${rand(1000, 9999)}`, device, technician, date]
      );
    }
  }
  console.log(`   ✓ ดำเนินการสร้างตั๋วงานเรียบร้อย`);

  // 5. Seed Withdrawals (60 Items) in strict chronological ascending order
  console.log('\n📤 สร้างใบเบิกพัสดุและธุรกรรม 60 รายการ (เรียงลำดับ ID จากเก่าไปใหม่)...');
  const wdDates = generateChronologicalDates(60, 60); // 60 dates over 60 days
  const wdIds = [];

  const insertTransaction = db.prepare(`
    INSERT INTO inventory_transactions (
      inventory_id, transaction_type, quantity_added, quantity_withdrawn, quantity_borrowed, quantity_returned,
      project_name, station_id, user_name, withdrawal_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < 60; i++) {
    const station = pick(stations);
    const stationAreas = areasByStation[station.id] || [];
    const area = stationAreas.length > 0 ? pick(stationAreas) : null;
    const date = wdDates[i];
    const recipient = pick(THAI_NAMES);
    const type = pick(['ติดตั้งใหม่', 'ซ่อมแซม', 'สำรองใช้งาน', 'ทดสอบ']);
    const projectName = pick(PROJECTS);
    const note = `สำหรับงานปรับปรุง ณ ด่านชั่ง ${station.name} (${area ? area.name : 'พื้นที่ทั่วไป'})`;

    const res = await run(
      `INSERT INTO withdrawals (recipient, type, note, project_name, location, station_id, station_area_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipient, type, note, projectName, station.name, station.id, area ? area.id : null, date]
    );
    const wdId = res.lastID;
    wdIds.push({ id: wdId, recipient, type, projectName, station, date });

    // Add 1-3 items to withdrawal
    const itemsCount = rand(1, 3);
    const chosenItems = [];
    while (chosenItems.length < itemsCount) {
      const item = pick(inventoryIds);
      if (!chosenItems.some(x => x.id === item.id)) {
        chosenItems.push(item);
      }
    }

    for (const item of chosenItems) {
      const qty = rand(1, 2);
      await run(
        `INSERT INTO withdrawal_items (withdrawal_id, inventory_id, quantity) VALUES (?, ?, ?)`,
        [wdId, item.id, qty]
      );
      
      // Update main stock quantity
      await run(`UPDATE inventory SET quantity = MAX(0, quantity - ?) WHERE id = ?`, [qty, item.id]);

      // If item requires SN, allocate instances to withdrawal
      let snStr = null;
      if (item.requires_sn === 1) {
        const instances = await all(`SELECT id, serial_number FROM inventory_instances WHERE inventory_id = ? AND status = 'In Stock' LIMIT ?`, [item.id, qty]);
        if (instances.length > 0) {
          snStr = instances.map(inst => inst.serial_number).join(', ');
          const instIds = instances.map(inst => inst.id);
          await run(`UPDATE inventory_instances SET status = 'Withdrawn', current_location = ?, station_id = ? WHERE id IN (${instIds.join(',')})`, [station.name, station.id]);
          
          // update serial_numbers in withdrawal_items
          await run(`UPDATE withdrawal_items SET serial_numbers = ? WHERE withdrawal_id = ? AND inventory_id = ?`, [snStr, wdId, item.id]);
        }
      }

      // Log transaction
      const isBorrow = type === 'ทดสอบ' || type === 'สำรองใช้งาน';
      const txType = isBorrow ? 'BORROW' : 'WITHDRAW';
      insertTransaction.run(
        item.id,
        txType,
        0, // quantity_added
        isBorrow ? 0 : qty, // quantity_withdrawn
        isBorrow ? qty : 0, // quantity_borrowed
        0, // quantity_returned
        projectName,
        station.id,
        recipient,
        wdId,
        date
      );
    }
  }

  // 6. Seed Returns (20 returns of borrows/test withdrawals)
  console.log('\n📥 ทำการรับคืนของเบิกทดสอบ 20 รายการ...');
  // Find test/borrow withdrawals
  const returnableWds = wdIds.filter(w => w.type === 'ทดสอบ' || w.type === 'สำรองใช้งาน');
  const returnCount = Math.min(20, returnableWds.length);

  for (let i = 0; i < returnCount; i++) {
    const wd = returnableWds[i];
    const items = await all('SELECT * FROM withdrawal_items WHERE withdrawal_id = ?', [wd.id]);
    
    // Return date is 5-20 days after withdrawal
    const retDate = new Date(new Date(wd.date).getTime() + 60 * 60 * 1000 * 24 * rand(5, 20)).toISOString().replace('T', ' ').substring(0, 19);

    for (const item of items) {
      // Mark transaction status as returned
      await run(`UPDATE inventory_transactions SET status = 'RETURNED' WHERE withdrawal_id = ? AND inventory_id = ?`, [wd.id, item.inventory_id]);

      // Restore main stock quantity
      await run(`UPDATE inventory SET quantity = quantity + ? WHERE id = ?`, [item.quantity, item.inventory_id]);

      // If SN instances were withdrawn, mark them back in stock
      if (item.serial_numbers) {
        const sns = item.serial_numbers.split(', ').map(s => s.trim()).filter(Boolean);
        if (sns.length > 0) {
          const placeholders = sns.map(() => '?').join(',');
          await run(`UPDATE inventory_instances SET status = 'In Stock', current_location = 'Warehouse', station_id = NULL WHERE serial_number IN (${placeholders})`, sns);
        }
      }

      // Log Return transaction
      insertTransaction.run(
        item.inventory_id,
        'RETURN',
        0, // quantity_added
        0, // quantity_withdrawn
        0, // quantity_borrowed
        item.quantity, // quantity_returned
        wd.projectName,
        wd.station.id,
        wd.recipient,
        wd.id,
        retDate
      );
    }
  }

  insertTransaction.finalize();
  console.log(`   ✓ สร้างประวัติคืนพัสดุเรียบร้อย`);

  // 7. Seed Purchase Orders (15 Items) in strict chronological ascending order
  console.log('\n📋 สร้างเอกสารใบสั่งซื้อจัดหาอะไหล่ 15 ฉบับ...');
  const poDates = generateChronologicalDates(15, 60);

  for (let i = 0; i < 15; i++) {
    const poNo = `PO-${String(100000 + i + 1).substring(1)}`;
    const date = poDates[i];
    const company = pick(COMPANIES);
    const requester = pick(THAI_NAMES);
    const creator = Math.random() < 0.4 ? 'System' : requester;
    
    // Status distribution
    let status = 'Received';
    if (i === 14) status = 'Draft';
    else if (i === 13) status = 'Pending';
    else if (i === 12) status = 'Approved';
    
    const note = `ใบสั่งซื้อสำหรับสต็อกกลางด่านชั่ง WIM ประจำรอบไตรมาส`;
    
    const res = await run(
      `INSERT INTO purchase_orders (po_no, company_name, ordered_by, created_by, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [poNo, company, requester, creator, note, status, date, date]
    );
    const poId = res.lastID;

    // Add 1-4 items per PO
    const itemsCount = rand(1, 4);
    const chosenItems = [];
    while (chosenItems.length < itemsCount) {
      const item = pick(inventoryIds);
      if (!chosenItems.some(x => x.id === item.id)) {
        chosenItems.push(item);
      }
    }

    for (const item of chosenItems) {
      const qty = rand(10, 30);
      const price = rand(500, 15000);
      const rcvQty = status === 'Received' ? qty : 0;
      
      await run(
        `INSERT INTO purchase_order_items (po_id, inventory_id, quantity, unit_price, received_quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [poId, item.id, qty, price, rcvQty]
      );

      // If Received, add to stock quantity and log transaction
      if (status === 'Received') {
        await run(`UPDATE inventory SET quantity = quantity + ? WHERE id = ?`, [qty, item.id]);
        
        // Log ADD_STOCK transaction
        await run(
          `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note, created_at, user_name)
           VALUES (?, 'ADD_STOCK', ?, ?, ?, ?)`,
          [item.id, qty, `รับพัสดุตามใบสั่งซื้อเลขที่ ${poNo}`, date, 'System']
        );
      }
    }
  }

  // Re-enable FK constraints
  await run('PRAGMA foreign_keys = ON');

  // 8. Output Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const counts = {};
  for (const t of ['stations', 'station_areas', 'inventory', 'repairs', 'withdrawals', 'withdrawal_items', 'inventory_transactions', 'purchase_orders', 'purchase_order_items']) {
    const r = await get(`SELECT COUNT(*) as c FROM ${t}`);
    counts[t] = r.c;
  }
  console.log('📊 สรุปรายงานจำนวนข้อมูลในระบบปัจจุบัน:');
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${String(v).padStart(5)} ${k}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ การ Seed ข้อมูลจำลองเสร็จสมบูรณ์เรียบร้อยแล้ว!\n');

  db.close();
}

main().catch(err => {
  console.error('❌ เกิดข้อผิดพลาดร้ายแรง:', err);
  db.close();
  process.exit(1);
});
