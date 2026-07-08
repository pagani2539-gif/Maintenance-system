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

const highwaysByRegion = {
  'ภาคเหนือ': ['1', '11', '12', '101', '102', '103', '105', '108', '117', '118'],
  'ภาคกลาง': ['1', '9', '32', '33', '302', '305', '309', '340', '345'],
  'ภาคตะวันออกเฉียงเหนือ': ['2', '12', '21', '22', '23', '24', '201', '202', '205', '212', '226'],
  'ภาคตะวันออก': ['3', '7', '33', '34', '304', '331', '348', '359'],
  'ภาคตะวันตก': ['4', '35', '323', '324', '3091', '3206'],
  'ภาคใต้': ['4', '41', '42', '43', '401', '402', '403', '408', '410', '414']
};

const THAI_NAMES = [
  'สมชาย ใจดี', 'สมหญิง รักเรียน', 'วิชัย มานะ', 'มานี ชูใจ', 'ปิติ ยินดี',
  'ชูใจ สายเสมอ', 'สมศักดิ์ แข็งแรง', 'กิตติ มั่งมี', 'ภานุ วัฒนพงศ์', 'วรวุฒิ สิทธิชัย',
  'ศิริพร อารีย์', 'รัตนา สุขสันต์'
];

const DEVICES = [
  'คอมพิวเตอร์ Desktop', 'เครื่องพิมพ์ (Printer)', 'เครื่องสแกน (Scanner)',
  'จอภาพ (Monitor)', 'กล้อง CCTV', 'เซ็นเซอร์ตรวจจับรถ',
  'เครื่องสำรองไฟ (UPS)', 'สวิตช์เครือข่าย (Switch)'
];

const PROBLEMS = [
  'เปิดไม่ติด', 'หน้าจอเป็นสีฟ้า (Blue Screen)', 'พิมพ์ไม่ออก/กระดาษติด',
  'ภาพไม่ชัด/สัญญาณขาดหาย', 'ไม่สามารถบันทึกข้อมูลได้', 'เครื่องร้อนเกินไปและดับเอง',
  'แบตเตอรี่เสื่อมสภาพ', 'ไม่สามารถเชื่อมต่อเครือข่ายได้'
];

const PROJECTS = [
  'โครงการพัฒนาทางหลวง', 'โครงการปรับปรุงระบบด่าน', 'งานซ่อมบำรุงประจำปี', 'โครงการติดตั้งกล้องใหม่'
];

const defaultAreas = [
  'ห้องควบคุม/ตู้ปฏิบัติงาน',
  'ช่องทางชั่งน้ำหนักหลัก',
  'กล้องวงจรปิด/กล้อง ANPR',
  'ระบบเชื่อมต่อเครือข่ายและเซนเซอร์'
];

const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];
const formatNow = () => new Date().toISOString().replace('T', ' ').substring(0, 19);
const makeKmPost = () => `กม. ${Math.floor(Math.random() * 400) + 1} + ${Math.floor(Math.random() * 10) * 100}`;

const stationTypes = ['WEIGH_STATION', 'CHECK_POINT'];
const directions = ['INBOUND', 'OUTBOUND', 'BOTH', 'NONE'];
const statuses = ['รอดำเนินการ', 'กำลังซ่อม', 'รออะไหล่', 'เสร็จสิ้น'];

const clearTables = [
  'station_areas',
  'stations',
  'repair_logs',
  'repair_images',
  'device_changes',
  'repairs'
];

console.log('--- Seed 77 Provinces with one station per province ---');

db.serialize(() => {
  db.run('PRAGMA foreign_keys = OFF;');

  clearTables.forEach((table) => {
    db.run(`DELETE FROM ${table}`);
    db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
  });

  db.run('PRAGMA foreign_keys = ON;');

  const stationStmt = db.prepare(`
    INSERT INTO stations (code, name, station_type, highway_no, km_post, direction, region, province, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const areaStmt = db.prepare(`
    INSERT INTO station_areas (station_id, name, status, created_at)
    VALUES (?, ?, 1, ?)
  `);

  const repairStmt = db.prepare(`
    INSERT INTO repairs (ticket_no, reporter, location, station_id, station_area_id, device_name, problem, priority, status, technician, project_name, received_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let stationId = 1;
  const now = formatNow();

  Object.entries(provincesByRegion).forEach(([region, provinces]) => {
    provinces.forEach((province) => {
      const highway = getRandomItem(highwaysByRegion[region]);
      const dir = getRandomItem(directions);
      const shortDir = dir === 'INBOUND' ? 'IN' : dir === 'OUTBOUND' ? 'OUT' : dir === 'BOTH' ? 'BOTH' : 'NONE';
      const code = `STN-${stationId}-${shortDir}`;
      const name = `ด่านชั่งน้ำหนัก ${province} (ทล.${highway})`;
      const stationType = getRandomItem(stationTypes);
      const kmPost = makeKmPost();

      stationStmt.run(code, name, stationType, highway, kmPost, dir, region, province, now, now);

      defaultAreas.forEach((areaName) => {
        areaStmt.run(stationId, areaName, now);
      });

      const ticketNo = `TKT-${String(stationId).padStart(3, '0')}`;
      const reporter = getRandomItem(THAI_NAMES);
      const deviceName = getRandomItem(DEVICES);
      const problem = getRandomItem(PROBLEMS);
      const projectName = `ตรวจสอบความถูกต้องที่ ${province}`;
      const status = getRandomItem(statuses);
      const technician = status === 'รอดำเนินการ' ? null : getRandomItem(THAI_NAMES);

      repairStmt.run(
        ticketNo,
        reporter,
        name,
        stationId,
        null,
        deviceName,
        problem,
        'ปกติ',
        status,
        technician,
        projectName,
        now,
        now,
        now
      );

      stationId += 1;
    });
  });

  stationStmt.finalize();
  areaStmt.finalize();
  repairStmt.finalize();

  db.get('SELECT COUNT(*) AS count FROM stations', (err, row) => {
    if (err) {
      console.error('Count stations failed:', err);
    } else {
      console.log(`Stations seeded: ${row.count}`);
    }
  });

  db.get('SELECT COUNT(*) AS count FROM repairs', (err, row) => {
    if (err) {
      console.error('Count repairs failed:', err);
    } else {
      console.log(`Repairs seeded: ${row.count}`);
    }
  });

  db.close();
});
