const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

const items = [
  {
    name: 'Industrial Computer (Advantech)',
    model: 'Advantech ARK-2250',
    description: 'คอมพิวเตอร์อุตสาหกรรมประสิทธิภาพสูงสำหรับด่านชั่งน้ำหนักและประมวลผลกล้อง LPR',
    quantity: 15,
    min_stock: 5,
    requires_sn: 1,
    storage_location: 'ตู้ A1 ชั้น 2',
    prefix: 'ARK2250-WIM-'
  },
  {
    name: 'กล้อง IP CCTV (Hikvision LPR)',
    model: 'Hikvision DS-2CD4A26FWD-IZS',
    description: 'กล้องจับป้ายทะเบียน LPR ความละเอียดสูงพร้อมไฟอินฟราเรดในตัว',
    quantity: 30,
    min_stock: 10,
    requires_sn: 1,
    storage_location: 'ตู้ B3 ชั้น 1',
    prefix: 'DS2CD4A-LPR-'
  },
  {
    name: 'Industrial Switch 8-Port (Moxa)',
    model: 'Moxa EDS-408A',
    description: 'สวิตช์เครือข่ายอุตสาหกรรม 8 พอร์ตทนอุณหภูมิสูงสำหรับติดตั้งในตู้เคสควบคุมด่าน',
    quantity: 12,
    min_stock: 4,
    requires_sn: 1,
    storage_location: 'ตู้ A2 ชั้น 1',
    prefix: 'MOX-EDS408-SW-'
  },
  {
    name: 'Piezoelectric Sensor (Kistler)',
    model: 'Kistler Linea Type 9195',
    description: 'เซ็นเซอร์แผ่นความแข็งแรงสูงสำหรับฝังในพื้นทางวิ่งตรวจจับน้ำหนักล้อรถขณะเคลื่อนที่ (WIM)',
    quantity: 8,
    min_stock: 3,
    requires_sn: 1,
    storage_location: 'ตู้ C1 ชั้นล่าง',
    prefix: 'KIS9195-PZ-'
  },
  {
    name: 'Rugged UPS 1500VA (APC)',
    model: 'APC Smart-UPS SRT 1500VA',
    description: 'เครื่องสำรองไฟฟ้าขนาด 1500VA ชนิดยึดตู้แร็คเพื่อสำรองระบบคอนโทรลเลอร์สถานี',
    quantity: 10,
    min_stock: 3,
    requires_sn: 1,
    storage_location: 'ตู้ D1 ชั้นล่าง',
    prefix: 'APC-SRT1500-UPS-'
  }
];

// Distribute conditions realistically
// New: ~50%, Good: ~30%, Fair: ~15%, Broken: ~5%
function getRandomCondition(index) {
  const mod = index % 20;
  if (mod === 0) return 'Broken';      // 5%
  if (mod <= 3) return 'Fair';         // 15%
  if (mod <= 9) return 'Good';         // 30%
  return 'New';                        // 50%
}

db.serialize(() => {
  db.run('PRAGMA foreign_keys = OFF;');
  
  // Clear old inventory and instances
  db.run('DELETE FROM inventory_instances');
  db.run('DELETE FROM inventory_transactions');
  db.run('DELETE FROM inventory');
  
  console.log('Cleared existing inventory and instances.');

  const itemStmt = db.prepare(`
    INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const instStmt = db.prepare(`
    INSERT INTO inventory_instances (inventory_id, serial_number, condition, status, current_location)
    VALUES (?, ?, ?, 'In Stock', 'Warehouse')
  `);

  items.forEach((item) => {
    itemStmt.run(
      item.name,
      item.model,
      item.description,
      item.quantity,
      item.min_stock,
      item.requires_sn,
      item.storage_location,
      function(err) {
        if (err) {
          console.error('Error inserting item:', err.message);
          return;
        }

        const itemId = this.lastID;
        console.log(`Inserted inventory item: ${item.name} (ID: ${itemId})`);

        // Generate serial numbers matching the quantity
        for (let i = 1; i <= item.quantity; i++) {
          const serialNo = `${item.prefix}${String(i).padStart(3, '0')}`;
          const condition = getRandomCondition(i);
          instStmt.run(itemId, serialNo, condition, (err2) => {
            if (err2) {
              console.error(`Error inserting instance ${serialNo}:`, err2.message);
            }
          });
        }
        console.log(`  ✓ Generated ${item.quantity} serial numbers (instances) for ${item.name}`);
      }
    );
  });

  itemStmt.finalize();
  
  setTimeout(() => {
    instStmt.finalize(() => {
      db.run('PRAGMA foreign_keys = ON;');
      console.log('Seeding finished successfully!');
      db.close();
    });
  }, 1000);
});
