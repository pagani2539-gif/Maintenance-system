const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

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

// Real Highways in Thailand by Region
const highwaysByRegion = {
  'ภาคเหนือ': ['1', '11', '12', '101', '102', '103', '105', '106', '108', '117', '118', '1065', '1150', '1263'],
  'ภาคกลาง': ['1', '9', '32', '33', '302', '305', '309', '340', '345', '347'],
  'ภาคตะวันออกเฉียงเหนือ': ['2', '12', '21', '22', '23', '24', '201', '202', '205', '212', '213', '214', '226', '2026'],
  'ภาคตะวันออก': ['3', '7', '33', '34', '304', '331', '344', '348', '359'],
  'ภาคตะวันตก': ['4', '35', '323', '324', '3091', '3183', '3206'],
  'ภาคใต้': ['4', '41', '42', '43', '401', '402', '403', '408', '410', '414']
};

// Common Thai District prefixes and suffixes to generate realistic names
const prefixes = ['เมือง', 'บาง', 'บ้าน', 'ศรี', 'พระ', 'หนอง', 'ปาก', 'ท่า', 'คลอง', 'แม่', 'วัง', 'ดอน', 'โนน', 'โคก', 'เขา', 'ทุ่ง', 'เชียง', 'ป่า', 'พาน', 'น้ำ', 'ด่าน', 'แก่ง', 'ห้วย', 'ยาง', 'เนิน', 'นา', 'ลาน', 'พัง', 'ทับ', 'ควน'];
const suffixes = ['ดี', 'พล', 'ชัย', 'มูล', 'คาม', 'งาม', 'นา', 'เจริญ', 'บุรี', 'นคร', 'ทอง', 'แก้ว', 'คำ', 'พรม', 'สุข', 'พัฒนา', 'ใหญ่', 'น้อย', 'เหนือ', 'ใต้', 'ใหม่', 'เก่า', 'เงิน', 'จันทร์', 'ประดู่', 'โพธิ์', 'บัว', 'มงคล', 'สวรรค์', 'สระ', 'แก้ง', 'เดช', 'ชล', 'ทิพย์', 'เกียรติ'];

const wimTypes = [
  'ระบบชั่งน้ำหนักขณะเคลื่อนที่ (WIM)',
  'ระบบคัดกรองน้ำหนักชั่งขณะเคลื่อนที่ (WIM High Speed)',
  'จุดตรวจชั่งน้ำหนักอัตโนมัติ (Virtual WIM)',
  'ด่านชั่งน้ำหนักระบบ WIM'
];

const directions = ['INBOUND', 'OUTBOUND', 'BOTH', 'NONE'];
const regions = Object.keys(provincesByRegion);

function generateRandomDistrict() {
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  return p + s;
}

db.serialize(() => {
  // Disable foreign keys during bulk seeding to avoid async insert race conditions
  db.run("PRAGMA foreign_keys = OFF;");
  
  // Find starting ID
  db.get("SELECT MAX(id) as maxId FROM stations", [], (err, row) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    
    let startId = (row && row.maxId ? row.maxId : 0) + 1;
    console.log(`Starting to seed 1000 WIM stations from ID: ${startId}...`);
    
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
      
      const uniqueNames = new Set();
      
      for (let i = 0; i < 1000; i++) {
        const id = startId + i;
        
        // Randomly select region
        const region = regions[Math.floor(Math.random() * regions.length)];
        
        // Randomly select province from region
        const provinces = provincesByRegion[region];
        const province = provinces[Math.floor(Math.random() * provinces.length)];
        
        // Randomly select highway from region
        const highways = highwaysByRegion[region];
        const highway = highways[Math.floor(Math.random() * highways.length)];
        
        // Generate unique name
        let district = generateRandomDistrict();
        let name = `สถานีตรวจสอบน้ำหนัก WIM ${district} (ทล.${highway})`;
        let attempts = 0;
        while (uniqueNames.has(name) && attempts < 100) {
          district = generateRandomDistrict();
          name = `สถานีตรวจสอบน้ำหนัก WIM ${district} (ทล.${highway} กม.${Math.floor(Math.random() * 500) + 1})`;
          attempts++;
        }
        uniqueNames.add(name);
        
        const type = wimTypes[Math.floor(Math.random() * wimTypes.length)];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        const km = `กม. ${Math.floor(Math.random() * 400) + 10} + ${Math.floor(Math.random() * 10) * 100}`;
        
        // Code dynamic generation matching server code
        let shortDir = 'NONE';
        if (dir === 'INBOUND') shortDir = 'IN';
        else if (dir === 'OUTBOUND') shortDir = 'OUT';
        else if (dir === 'BOTH') shortDir = 'BOTH';
        else if (dir === 'NONE') shortDir = 'NONE';
        
        const code = `STN-${id}-${shortDir}`;
        
        // Insert station
        stationStmt.run(id, code, name, type, highway, km, dir, region, province);
        
        // Seed WIM specific areas
        const areas = [
          'เซนเซอร์ชั่งน้ำหนัก Piezoelectric (WIM)',
          'กล้องตรวจจับเลขทะเบียนและแผ่นป้าย (ANPR WIM)',
          'ระบบตรวจสอบความเร็วและคัดกรองข้อมูล',
          'ตู้ควบคุมระบบและไฟสัญญาณริมทาง'
        ];
        
        areas.forEach(areaName => {
          areaStmt.run(id, areaName);
        });
      }
      
      stationStmt.finalize();
      areaStmt.finalize();
      
      db.run("COMMIT;", (commitErr) => {
        if (commitErr) {
          console.error("Transaction commit error:", commitErr);
        } else {
          console.log("Successfully seeded 1000 WIM stations across 77 provinces into the database.");
          // Re-enable foreign keys after transaction commits successfully
          db.run("PRAGMA foreign_keys = ON;");
        }
      });
      
    } catch (e) {
      db.run("ROLLBACK;");
      console.error("Error during transaction execution:", e);
      db.run("PRAGMA foreign_keys = ON;");
    }
  });
});
