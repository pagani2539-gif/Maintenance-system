const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

const THAI_NAMES = [
  'สมชาย', 'สมหญิง', 'วิชัย', 'ประเสริฐ', 'อาทิตย์', 'นภา', 'ธนา', 'มณี', 'กนก', 'จรัส',
  'มานะ', 'มานี', 'ปิติ', 'ชูใจ', 'สมศักดิ์', 'สายใจ', 'ประวิทย์', 'อุดม', 'จินตนา', 'ยุพา',
  'อานนท์', 'เกรียงศักดิ์', 'ขวัญชัย', 'ฉัตรชัย', 'ชูศักดิ์', 'ณรงค์', 'ดำรง', 'ทรงพล', 'ธนพล', 'บุญส่ง',
  'วีระ', 'พงษ์ศักดิ์', 'รัตนา', 'วิไล', 'กมล', 'สุรพล', 'เกศรา', 'อัมพร', 'นงลักษณ์', 'ไพโรจน์'
];

const LOCATIONS = [
  'สำนักงานใหญ่', 'คลังสินค้า A', 'คลังสินค้า B', 'สาขาย่อย ลาดพร้าว', 'สาขาย่อย บางนา', 'สาขาย่อย ปทุมวัน',
  'ศูนย์บริการลูกค้า', 'โรงงาน 1', 'โรงงาน 2', 'แผนก IT', 'ห้องประชุมชั้น 4',
  'อาคาร A ชั้น 2', 'อาคาร B ชั้น 5', 'จุดตรวจรับสินค้า', 'แผนกบัญชี', 'ห้องเซิร์ฟเวอร์', 'โกดังสินค้า 3',
  'เขตนิคมฯ อมตะ', 'เขตนิคมฯ บางปู', 'สาขาเชียงใหม่', 'สาขาภูเก็ต', 'สาขาขอนแก่น'
];

const DEVICES = [
  'Laptop Dell Latitude', 'Printer HP LaserJet', 'Monitor Samsung 24"', 'UPS APC 1000VA',
  'Router Cisco', 'IP Phone Grandstream', 'Scanner Epson', 'Projector Sony', 'MacBook Air',
  'Desktop PC HP ProDesk', 'Switch TP-Link', 'External HDD WD 2TB', 'Mouse Logitech', 'Keyboard Microsoft',
  'iPad Pro', 'Surface Pro', 'Docking Station', 'Wireless AP'
];

const PROBLEMS = [
  'เปิดไม่ติด', 'หน้าจอแตก', 'ปริ้นไม่ออก', 'เครื่องช้ามาก', 'ติดไวรัส',
  'แบตเตอรี่เสื่อม', 'คีย์บอร์ดเสีย', 'เชื่อมต่อ Wi-Fi ไม่ได้', 'มีเสียงดังผิดปกติ', 'เครื่องร้อนเกินไป',
  'ไฟล์หาย', 'โปรแกรมค้าง', 'ชาร์จไฟไม่เข้า', 'ลำโพงไม่มีเสียง', 'เมาส์เลื่อนไม่ไป'
];

const PROJECTS = [
  'โครงการพัฒนาองค์กร', 'ระบบบริหารจัดการคลังสินค้า', 'ปรับปรุงระบบเครือข่าย', 'โครงการ Smart Office', 'บำรุงรักษาประจำปี',
  'ขยายระบบไอที 2567', 'ขยายระบบไอที 2568', 'โครงการ Work from Home', 'ติดตั้งระบบกล้องวงจรปิด', 'อัพเกรดคอมพิวเตอร์พนักงาน',
  'Digital Transformation', 'Cloud Migration', 'Security Hardening', 'ERP Implementation'
];

const STATUSES_REPAIR = ['รอดำเนินการ', 'กำลังซ่อม', 'รออะไหล่', 'เสร็จสิ้น'];
const PRIORITIES = ['ปกติ', 'ด่วน', 'ด่วนมาก', 'วิกฤต'];
const TYPES_REPAIR = ['repair', 'claim'];

const INVENTORY_NAMES = [
  'Ram 8GB DDR4', 'Ram 16GB DDR4', 'SSD 500GB NVMe', 'SSD 1TB NVMe', 'HDD 1TB SATA', 'Keyboard USB', 'Mouse Wireless',
  'Power Supply 600W', 'Ink Cartridge HP', 'HDMI Cable 3m', 'LAN Cable Cat6', 'Webcam 1080p',
  'Adapter 65W', 'Toner 85A', 'USB Hub 4 Port', 'VGA Cable', 'DisplayPort Cable', 'SFP Module'
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
  console.log('--- Starting Seeding Process (Enhanced for Filters) ---');
  
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

  // Helper for sequential execution
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
      // 2. Insert 100 Inventory Items
      console.log('Seeding Inventory (100 items)...');
      const inventoryIds = [];
      for (let i = 1; i <= 100; i++) {
        const name = getRandom(INVENTORY_NAMES) + ' ' + (Math.floor(Math.random() * 1000));
        const requiresSn = Math.random() > 0.4 ? 1 : 0;
        const quantity = Math.floor(Math.random() * 50) + 10;
        const id = await runAsync(
          `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, 'Model-' + i, 'รายละเอียดสำหรับ ' + name, quantity, 5, requiresSn, getRandom(LOCATIONS), formatDate(getRandomDate(2)), formatDate(new Date())]
        );
        inventoryIds.push({ id, requiresSn });
      }

      // 3. Insert 200 Inventory Instances (Serial Numbers)
      console.log('Seeding Inventory Instances (200 items)...');
      const snInventories = inventoryIds.filter(item => item.requiresSn === 1);
      if (snInventories.length > 0) {
        for (let i = 1; i <= 200; i++) {
          const inv = getRandom(snInventories);
          const sn = 'SN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
          const condition = getRandom(['New', 'Good', 'Fair']);
          const status = getRandom(['In Stock', 'In Stock', 'In Stock', 'Borrowed', 'Withdrawn']);
          await runAsync(
            `INSERT INTO inventory_instances (inventory_id, serial_number, condition, status, current_location, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [inv.id, sn, condition, status, getRandom(LOCATIONS), formatDate(getRandomDate(1)), formatDate(new Date())]
          );
        }
      }

      // 4. Insert 400 Repairs
      console.log('Seeding Repairs (400 items)...');
      for (let i = 1; i <= 400; i++) {
        const ticketNo = 'TKT' + String(i).padStart(5, '0');
        const status = getRandom(STATUSES_REPAIR);
        const createdDate = getRandomDate(2);
        
        await runAsync(
          `INSERT INTO repairs (ticket_no, reporter, location, device_name, problem, priority, status, technician, repair_note, is_read, type, project_name, received_at, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketNo, getRandom(THAI_NAMES), getRandom(LOCATIONS), getRandom(DEVICES), 
            getRandom(PROBLEMS), getRandom(PRIORITIES), status, 
            status === 'รอดำเนินการ' ? null : getRandom(THAI_NAMES),
            status === 'เสร็จสิ้น' ? 'ดำเนินการแก้ไขเรียบร้อยแล้ว' : '',
            Math.random() > 0.5 ? 1 : 0,
            getRandom(TYPES_REPAIR),
            getRandom(PROJECTS),
            formatDate(createdDate), formatDate(createdDate), formatDate(new Date())
          ]
        );
      }

      // 5. Insert 150 Withdrawals
      console.log('Seeding Withdrawals (150 items)...');
      for (let i = 1; i <= 150; i++) {
        const createdDate = getRandomDate(2);
        
        const withdrawalId = await runAsync(
          `INSERT INTO withdrawals (recipient, type, note, project_name, location, created_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [getRandom(THAI_NAMES), getRandom(['เบิกใช้งาน', 'สำรองใช้งาน', 'ทดสอบ']), 'บันทึกการเบิกที่ ' + i, getRandom(PROJECTS), getRandom(LOCATIONS), formatDate(createdDate)]
        );

        const itemsCount = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < itemsCount; j++) {
          const inv = getRandom(inventoryIds);
          const qty = Math.floor(Math.random() * 5) + 1;
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

      // 6. Insert 150 Purchase Orders
      console.log('Seeding Purchase Orders (150 items)...');
      const poStatuses = ['Draft', 'Pending', 'Approved', 'Received', 'Cancelled'];
      for (let i = 1; i <= 150; i++) {
        const poNo = 'PO' + String(i).padStart(5, '0');
        const status = getRandom(poStatuses);
        const createdDate = getRandomDate(1.5);

        const poId = await runAsync(
          `INSERT INTO purchase_orders (po_no, status, created_by, note, ordered_by, project_name, company_name, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            poNo, status, 'System', 'บันทึกใบสั่งซื้อเลขที่ ' + poNo, getRandom(THAI_NAMES), getRandom(PROJECTS), 
            'บริษัท เวนเดอร์ จำกัด (' + (Math.floor(Math.random() * 20) + 1) + ')',
            formatDate(createdDate), formatDate(new Date())
          ]
        );

        const itemsCount = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < itemsCount; j++) {
          const inv = getRandom(inventoryIds);
          const qty = Math.floor(Math.random() * 20) + 5;
          const price = Math.floor(Math.random() * 1000) + 100;
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
      console.log('- Inventory: 100');
      console.log('- Inventory Instances (SN): 200');
      console.log('- Repairs: 400');
      console.log('- Withdrawals: 150');
      console.log('- Purchase Orders: 150');
      console.log('Total primary records: ~1,000');
      console.log('Range: Last 2 years to present.');
      
      db.close();
    } catch (err) {
      console.error('Error during seeding:', err);
      db.close();
    }
  }

  seed();
});

