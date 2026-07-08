const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

const THAI_NAMES = [
  'สมชาย', 'สมหญิง', 'วิชัย', 'ประเสริฐ', 'อาทิตย์', 'นภา', 'ธนา', 'มณี', 'กนก', 'จรัส',
  'มานะ', 'มานี', 'ปิติ', 'ชูใจ', 'สมศักดิ์', 'สายใจ', 'ประวิทย์', 'อุดม', 'จินตนา', 'ยุพา',
  'อานนท์', 'เกรียงศักดิ์', 'ขวัญชัย', 'ฉัตรชัย', 'ชูศักดิ์', 'ณรงค์', 'ดำรง', 'ทรงพล', 'ธนพล', 'บุญส่ง',
  'วีระ', 'พงษ์ศักดิ์', 'รัตนา', 'วิไล', 'กมล', 'สุรพล', 'เกศรา', 'อัมพร', 'นงลักษณ์', 'ไพโรจน์',
  'สัญชัย', 'ศิริพร', 'สมบัติ', 'ดวงพร', 'นรินทร์', 'พรชัย', 'วรรณภา', 'สุรชัย', 'อรวรรณ', 'ชวลิต'
];

const LOCATIONS = [
  'สำนักงานใหญ่', 'คลังสินค้า A', 'คลังสินค้า B', 'สาขาย่อย ลาดพร้าว', 'สาขาย่อย บางนา', 'สาขาย่อย ปทุมวัน',
  'ศูนย์บริการลูกค้า', 'โรงงาน 1', 'โรงงาน 2', 'แผนก IT', 'ห้องประชุมชั้น 4',
  'อาคาร A ชั้น 2', 'อาคาร B ชั้น 5', 'จุดตรวจรับสินค้า', 'แผนกบัญชี', 'ห้องเซิร์ฟเวอร์', 'โกดังสินค้า 3',
  'เขตนิคมฯ อมตะ', 'เขตนิคมฯ บางปู', 'สาขาเชียงใหม่', 'สาขาภูเก็ต', 'สาขาขอนแก่น', 'สาขาโคราช', 'สาขาหาดใหญ่'
];

const DEVICES = [
  'Laptop Dell Latitude', 'Printer HP LaserJet', 'Monitor Samsung 24"', 'UPS APC 1000VA',
  'Router Cisco', 'IP Phone Grandstream', 'Scanner Epson', 'Projector Sony', 'MacBook Air',
  'Desktop PC HP ProDesk', 'Switch TP-Link', 'External HDD WD 2TB', 'Mouse Logitech', 'Keyboard Microsoft',
  'iPad Pro', 'Surface Pro', 'Docking Station', 'Wireless AP', 'Server Dell PowerEdge', 'NAS Synology'
];

const PROBLEMS = [
  'เปิดไม่ติด', 'หน้าจอแตก', 'ปริ้นไม่ออก', 'เครื่องช้ามาก', 'ติดไวรัส',
  'แบตเตอรี่เสื่อม', 'คีย์บอร์ดเสีย', 'เชื่อมต่อ Wi-Fi ไม่ได้', 'มีเสียงดังผิดปกติ', 'เครื่องร้อนเกินไป',
  'ไฟล์หาย', 'โปรแกรมค้าง', 'ชาร์จไฟไม่เข้า', 'ลำโพงไม่มีเสียง', 'เมาส์เลื่อนไม่ไป',
  'จอฟ้า (BSOD)', 'ลง Windows ใหม่', 'เปลี่ยนหัวพิมพ์', 'ทำความสะอาดเครื่อง', 'อัพเกรดแรม'
];

const PROJECTS = [
  'โครงการพัฒนาองค์กร', 'ระบบบริหารจัดการคลังสินค้า', 'ปรับปรุงระบบเครือข่าย', 'โครงการ Smart Office', 'บำรุงรักษาประจำปี',
  'ขยายระบบไอที 2567', 'ขยายระบบไอที 2568', 'โครงการ Work from Home', 'ติดตั้งระบบกล้องวงจรปิด', 'อัพเกรดคอมพิวเตอร์พนักงาน',
  'Digital Transformation', 'Cloud Migration', 'Security Hardening', 'ERP Implementation', 'ISO 27001 Certification'
];

const STATUSES_REPAIR = ['รอดำเนินการ', 'กำลังซ่อม', 'รออะไหล่', 'เสร็จสิ้น'];
const PRIORITIES = ['ปกติ', 'ด่วน', 'ด่วนมาก', 'วิกฤต'];
const TYPES_REPAIR = ['repair', 'claim'];

const INVENTORY_NAMES = [
  'Ram 8GB DDR4', 'Ram 16GB DDR4', 'SSD 500GB NVMe', 'SSD 1TB NVMe', 'HDD 1TB SATA', 'Keyboard USB', 'Mouse Wireless',
  'Power Supply 600W', 'Ink Cartridge HP', 'HDMI Cable 3m', 'LAN Cable Cat6', 'Webcam 1080p',
  'Adapter 65W', 'Toner 85A', 'USB Hub 4 Port', 'VGA Cable', 'DisplayPort Cable', 'SFP Module',
  'Battery Laptop', 'Thermal Paste'
];

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDate(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function getRandomDate(yearsBack = 2) {
  const now = new Date();
  const past = new Date();
  past.setFullYear(now.getFullYear() - yearsBack);
  const timestamp = past.getTime() + Math.random() * (now.getTime() - past.getTime());
  return new Date(timestamp);
}

db.serialize(() => {
  console.log('--- Starting MASSIVE Comprehensive Seeding Process ---');
  
  // 1. Clear Existing Data
  console.log('Clearing existing data...');
  const tables = [
    'repair_logs', 'repair_images', 'device_changes', 'repairs',
    'inventory_transactions', 'inventory_instances', 'withdrawal_items', 'withdrawals',
    'purchase_order_items', 'purchase_orders', 'inventory'
  ];

  for (const table of tables) {
    db.run(`DELETE FROM ${table}`);
    db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
  }
  console.log('All tables cleared.');

  const runAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  async function seed() {
    try {
      // 2. Insert 200 Inventory Items
      console.log('Seeding Inventory (200 items)...');
      const inventoryIds = [];
      for (let i = 1; i <= 200; i++) {
        const name = getRandom(INVENTORY_NAMES) + ' ' + (Math.floor(Math.random() * 5000));
        const requiresSn = Math.random() > 0.4 ? 1 : 0;
        const quantity = Math.floor(Math.random() * 100) + 5;
        const id = await runAsync(
          `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, 'Model-' + i, 'รายละเอียดอุปกรณ์ ' + name, quantity, 10, requiresSn, getRandom(LOCATIONS), formatDate(getRandomDate(2)), formatDate(new Date())]
        );
        inventoryIds.push({ id, name, requiresSn });
      }

      // 3. Insert 500 Inventory Instances (Serial Numbers)
      console.log('Seeding Inventory Instances (500 items)...');
      const snInventories = inventoryIds.filter(item => item.requiresSn === 1);
      for (let i = 1; i <= 500; i++) {
        const inv = getRandom(snInventories);
        const sn = 'SN-' + Math.random().toString(36).substring(2, 12).toUpperCase();
        const condition = getRandom(['New', 'Good', 'Fair', 'Refurbished']);
        const status = getRandom(['In Stock', 'In Stock', 'In Stock', 'In Stock', 'Withdrawn', 'Repairing']);
        await runAsync(
          `INSERT INTO inventory_instances (inventory_id, serial_number, condition, status, current_location, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [inv.id, sn, condition, status, getRandom(LOCATIONS), formatDate(getRandomDate(1)), formatDate(new Date())]
        );
      }

      // 4. Insert 1000 Repairs
      console.log('Seeding Repairs (1000 items)...');
      for (let i = 1; i <= 1000; i++) {
        const ticketNo = (i % 2 === 0 ? 'REP' : 'CLM') + String(i).padStart(6, '0');
        const status = getRandom(STATUSES_REPAIR);
        const type = i % 2 === 0 ? 'repair' : 'claim';
        const createdDate = getRandomDate(2);
        
        const repairId = await runAsync(
          `INSERT INTO repairs (ticket_no, reporter, location, device_name, problem, priority, status, technician, repair_note, is_read, type, project_name, received_at, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketNo, getRandom(THAI_NAMES), getRandom(LOCATIONS), getRandom(DEVICES), 
            getRandom(PROBLEMS), getRandom(PRIORITIES), status, 
            status === 'รอดำเนินการ' ? null : getRandom(THAI_NAMES),
            status === 'เสร็จสิ้น' ? 'ดำเนินการซ่อมและทดสอบเรียบร้อย' : (status === 'รออะไหล่' ? 'รอสั่งซื้ออะไหล่จากต่างประเทศ' : ''),
            Math.random() > 0.3 ? 1 : 0,
            type,
            getRandom(PROJECTS),
            formatDate(createdDate), formatDate(createdDate), formatDate(new Date())
          ]
        );

        // Add 2-4 Logs for each repair
        const logCount = Math.floor(Math.random() * 3) + 2;
        for (let l = 0; l < logCount; l++) {
          const logDate = new Date(createdDate);
          logDate.setHours(logDate.getHours() + (l * 24));
          const actions = ['รับงาน', 'แจ้งปัญหาเพิ่มเติม', 'กำลังดำเนินการ', 'รออะไหล่', 'ซ่อมเสร็จสิ้น'];
          await runAsync(
            `INSERT INTO repair_logs (repair_id, action, note, user, created_at) VALUES (?, ?, ?, ?, ?)`,
            [repairId, getRandom(actions), 'บันทึกอัปเดตงานครั้งที่ ' + (l + 1), getRandom(THAI_NAMES), formatDate(logDate)]
          );
        }

        // 30% have device changes
        if (Math.random() > 0.7) {
          const inv = getRandom(inventoryIds);
          await runAsync(
            `INSERT INTO device_changes (repair_id, old_model, new_model, old_serial, new_serial, changed_by, changed_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [repairId, 'Old Model', inv.name, 'SN-OLD-123', 'SN-NEW-456', getRandom(THAI_NAMES), formatDate(new Date())]
          );
        }
      }

      // 5. Insert 300 Withdrawals
      console.log('Seeding Withdrawals (300 items)...');
      for (let i = 1; i <= 300; i++) {
        const createdDate = getRandomDate(2);
        const withdrawalId = await runAsync(
          `INSERT INTO withdrawals (recipient, type, note, project_name, location, created_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [getRandom(THAI_NAMES), getRandom(['ติดตั้งใหม่', 'ซ่อมแซม', 'สำรองใช้งาน', 'ทดสอบ']), 'เบิกไปใช้งานใน ' + getRandom(PROJECTS), getRandom(PROJECTS), getRandom(LOCATIONS), formatDate(createdDate)]
        );

        const itemsCount = Math.floor(Math.random() * 4) + 1;
        for (let j = 0; j < itemsCount; j++) {
          const inv = getRandom(inventoryIds);
          const qty = Math.floor(Math.random() * 3) + 1;
          await runAsync(
            `INSERT INTO withdrawal_items (withdrawal_id, inventory_id, quantity) VALUES (?, ?, ?)`,
            [withdrawalId, inv.id, qty]
          );
          
          await runAsync(
            `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_withdrawn, project_name, location, user_name, withdrawal_id, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [inv.id, 'WITHDRAW', qty, getRandom(PROJECTS), getRandom(LOCATIONS), getRandom(THAI_NAMES), withdrawalId, formatDate(createdDate)]
          );
        }
      }

      // 6. Insert 300 Purchase Orders
      console.log('Seeding Purchase Orders (300 items)...');
      const poStatuses = ['Draft', 'Pending', 'Approved', 'Received', 'Cancelled'];
      for (let i = 1; i <= 300; i++) {
        const poNo = 'PO-' + String(i).padStart(6, '0');
        const status = getRandom(poStatuses);
        const createdDate = getRandomDate(1.5);

        const poId = await runAsync(
          `INSERT INTO purchase_orders (po_no, status, created_by, note, ordered_by, project_name, company_name, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            poNo, status, 'System Admin', 'ใบสั่งซื้อสำหรับ ' + getRandom(PROJECTS), getRandom(THAI_NAMES), getRandom(PROJECTS), 
            'บริษัท ' + getRandom(['เทรดดิ้ง', 'คอมพิวเตอร์', 'เน็ตเวิร์ค', 'โซลูชั่น']) + ' จำกัด',
            formatDate(createdDate), formatDate(new Date())
          ]
        );

        const itemsCount = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < itemsCount; j++) {
          const inv = getRandom(inventoryIds);
          const qty = Math.floor(Math.random() * 50) + 10;
          const price = Math.floor(Math.random() * 5000) + 100;
          await runAsync(
            `INSERT INTO purchase_order_items (po_id, inventory_id, quantity, unit_price, received_quantity) 
             VALUES (?, ?, ?, ?, ?)`,
            [poId, inv.id, qty, price, status === 'Received' ? qty : 0]
          );

          if (status === 'Received') {
            await runAsync(
              `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, project_name, location, user_name, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [inv.id, 'ADD_STOCK', qty, getRandom(PROJECTS), getRandom(LOCATIONS), 'System', formatDate(createdDate)]
            );
          }
        }
      }

      console.log('--- Seeding Completed Successfully! ---');
      console.log('Summary:');
      console.log('- Inventory Items: 200');
      console.log('- Serial Numbers: 500');
      console.log('- Repairs/Claims: 1,000 (+ Logs & Changes)');
      console.log('- Withdrawals: 300 (+ Transaction History)');
      console.log('- Purchase Orders: 300');
      console.log('Total primary records: ~2,300');
      console.log('Range: 2 years back to present.');
      
      db.close();
    } catch (err) {
      console.error('CRITICAL ERROR during massive seeding:', err);
      db.close();
    }
  }

  seed();
});
