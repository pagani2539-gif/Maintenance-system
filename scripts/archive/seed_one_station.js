const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('--- Seeding exactly 1 test station ---');
  
  db.run("PRAGMA foreign_keys = ON;");

  // Insert 1 station
  const code = 'STN-1-IN';
  const name = 'สถานีตรวจสอบน้ำหนัก WIM บางมงคล (ขาเข้า)';
  const station_type = 'WEIGH_STATION';
  const highway_no = '304';
  const direction = 'INBOUND';
  const region = 'ภาคกลาง';
  const province = 'สุโขทัย';
  const responsible_person = 'นายสมชาย ใจดี';

  db.run(`
    INSERT OR IGNORE INTO stations (code, name, station_type, highway_no, direction, region, province, responsible_person)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [code, name, station_type, highway_no, direction, region, province, responsible_person], function(err) {
    if (err) {
      console.error('Error seeding test station:', err.message);
      db.close();
      return;
    }
    
    const stationId = this.lastID || 1;
    console.log(`Seeded station: ${name} (ID: ${stationId})`);

    // Seed default areas
    const defaultAreas = [
      'ช่องทางชั่งน้ำหนักหลัก',
      'ห้องควบคุมระบบคอมพิวเตอร์',
      'ลูปตรวจจับโลหะ ช่องทางที่ 1',
      'กล้อง ANPR (ทางเข้า)'
    ];

    const insertArea = db.prepare(`
      INSERT OR IGNORE INTO station_areas (station_id, name)
      VALUES (?, ?)
    `);

    for (const area of defaultAreas) {
      insertArea.run(stationId, area);
      console.log(`Seeded area: ${area} for station ID: ${stationId}`);
    }

    insertArea.finalize((err) => {
      if (err) {
        console.error('Error finalizing area statements:', err.message);
      } else {
        console.log('--- Test Station Seeding Completed Successfully ---');
      }
      db.close();
    });
  });
});
