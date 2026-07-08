const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 77 provinces list for mapping
const provincesByRegion = {
  'ภาคเหนือ': [
    'เชียงราย', 'เชียงใหม่', 'น่าน', 'พะเยา', 'แพร่', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'อุตรดิตถ์'
  ],
  'ภาคกลาง': [
    'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'อ่างทอง', 'สระบุรี',
    'สิงห์บุรี', 'ชัยนาท', 'ลพบุรี', 'สมุทรปราการ', 'สมุทรสาคร', 'สมุทรสงคราม', 'นครปฐม',
    'สุพรรณบุรี', 'นครสวรรค์', 'อุทัยธานี', 'กำแพงเพชร', 'สุโขทัย', 'พิษณุโลก', 'พิจิตร',
    'เพชรบูรณ์', 'นครนายก'
  ],
  'ภาคตะวันออกเฉียงเหนือ': [
    'หนองคาย', 'บึงกาฬ', 'นครพนม', 'สกลนคร', 'อุดรธานี', 'หนองบัวลำภู', 'เลย',
    'มุกดาหาร', 'กาฬสินธุ์', 'ขอนแก่น', 'อำนาจเจริญ', 'ยโสธร', 'ร้อยเอ็ด', 'มหาสารคาม',
    'ชัยภูมิ', 'นครราชสีมา', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'อุบลราชธานี'
  ],
  'ภาคตะวันออก': [
    'สระแก้ว', 'ปราจีนบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด'
  ],
  'ภาคตะวันตก': [
    'กาญจนบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์', 'ตาก'
  ],
  'ภาคใต้': [
    'ชุมพร', 'ระนอง', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต',
    'พัทลุง', 'ตรัง', 'ปัตตานี', 'สงขลา', 'สตูล', 'นราธิวาส', 'ยะลา'
  ]
};

const allProvinces = [];
const provinceToRegion = {};
Object.entries(provincesByRegion).forEach(([region, list]) => {
  list.forEach(p => {
    allProvinces.push(p);
    provinceToRegion[p] = region;
  });
});

// Paths to database and source file
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const sourceFile = path.join('C:/Users/HP/.gemini/antigravity/brain/f3c9d2cf-1e61-4c24-91f9-5d39a0495ed9/.system_generated/steps/561/content.md');

if (!fs.existsSync(sourceFile)) {
  console.error('Source file not found at: ' + sourceFile);
  process.exit(1);
}

const fileContent = fs.readFileSync(sourceFile, 'utf8');
const jsonStart = fileContent.indexOf('[{"name":');
if (jsonStart === -1) {
  console.error('Could not locate JSON start in the fetched file');
  process.exit(1);
}

const rawJson = fileContent.substring(jsonStart).trim();
let rawStations = [];
try {
  rawStations = JSON.parse(rawJson);
} catch (e) {
  console.error('Failed to parse JSON:', e);
  process.exit(1);
}

console.log(`Successfully parsed ${rawStations.length} raw stations from Department of Highways API.`);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = OFF;");
  
  // Clear existing stations
  db.run("DELETE FROM station_areas;");
  db.run("DELETE FROM stations;");
  
  db.run("BEGIN TRANSACTION;");
  
  try {
    const stationStmt = db.prepare(`
      INSERT INTO stations (id, code, name, station_type, highway_no, km_post, direction, region, province, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    
    const areaStmt = db.prepare(`
      INSERT INTO station_areas (station_id, name)
      VALUES (?, ?)
    `);

    let importedCount = 0;
    
    rawStations.forEach((raw, index) => {
      const id = index + 1;
      const name = raw.name.trim();
      const desc = raw.description || '';
      
      // 1. Determine direction
      let direction = 'NONE';
      if (name.includes('ขาเข้า')) direction = 'INBOUND';
      else if (name.includes('ขาออก')) direction = 'OUTBOUND';
      else if (name.includes('สองฝั่ง')) direction = 'BOTH';
      
      let shortDir = 'NONE';
      if (direction === 'INBOUND') shortDir = 'IN';
      else if (direction === 'OUTBOUND') shortDir = 'OUT';
      else if (direction === 'BOTH') shortDir = 'BOTH';
      
      const code = `STN-${id}-${shortDir}`;

      // 2. Extract Province
      let province = 'กรุงเทพมหานคร'; // fallback
      for (const p of allProvinces) {
        if (desc.includes(p) || name.includes(p)) {
          province = p;
          break;
        }
      }
      
      const region = provinceToRegion[province] || 'ภาคกลาง';

      // 3. Extract Highway Number
      let highway = '0';
      const hwMatch = desc.match(/ทางหลวงหมายเลข\s*(\d+)/) || desc.match(/สาย\s*(\d+)/);
      if (hwMatch) {
        highway = hwMatch[1];
      } else {
        // Fallback extract number close to กม. or from desc
        const numMatch = desc.match(/\b\d{1,4}\b/);
        if (numMatch) highway = numMatch[0];
      }

      // 4. Extract KM post
      let km = '—';
      const kmMatch = desc.match(/ก\.?ม\.?\s*ที่?\s*([\d\+\s]+)/);
      if (kmMatch) {
        km = 'กม. ' + kmMatch[1].trim();
      }

      // 5. Determine type
      let type = 'WEIGH_STATION';
      if (name.includes('จุดจอดพักรถ') || name.includes('จุดพักรถ') || name.includes('จุดจอดรถ')) {
        type = 'REST_AREA';
      } else if (name.includes('จุดตรวจน้ำหนัก') || name.includes('จุดตรวจ')) {
        type = 'CHECK_POINT';
      } else if (name.includes('จุดสุ่มตรวจ')) {
        type = 'SPOT_CHECK';
      }

      // Insert station
      stationStmt.run(id, code, name, type, highway, km, direction, region, province);

      // Seed standard WIM areas for these stations
      const areas = [
        'เซนเซอร์ชั่งน้ำหนัก Piezoelectric (WIM)',
        'กล้องตรวจจับเลขทะเบียนและแผ่นป้าย (ANPR WIM)',
        'ระบบตรวจสอบความเร็วและคัดกรองข้อมูล',
        'ตู้ควบคุมระบบและไฟสัญญาณริมทาง'
      ];
      
      areas.forEach(areaName => {
        areaStmt.run(id, areaName);
      });

      importedCount++;
    });

    stationStmt.finalize();
    areaStmt.finalize();

    db.run("COMMIT;", (commitErr) => {
      if (commitErr) {
        console.error("Transaction commit error:", commitErr);
        db.run("PRAGMA foreign_keys = ON;");
      } else {
        console.log(`Successfully imported ${importedCount} REAL weigh stations into the database.`);
        db.run("PRAGMA foreign_keys = ON;");
      }
    });

  } catch (e) {
    db.run("ROLLBACK;");
    console.error("Error importing official stations:", e);
    db.run("PRAGMA foreign_keys = ON;");
  }
});
