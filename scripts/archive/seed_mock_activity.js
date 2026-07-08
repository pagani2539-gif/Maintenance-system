/**
 * Mock activity seeder — fills the empty modules (withdrawals, ledger, POs)
 * by calling the REAL running API so all side-effects (stock decrement,
 * transactions, instances, auto-PO) stay consistent.
 *
 * Every record is tagged with "[MOCK]" in its note so it can be removed later
 * (see scripts/clear_mock_activity.js). Dates are spread across the last 60 days.
 *
 * Requires the backend dev server to be running on port 5221.
 * Run: node scripts/seed_mock_activity.js
 */
const path = require('path');
const { sign } = require(path.join(__dirname, '../server/utils/jwt'));
const sqlite3 = require('sqlite3').verbose();

const BASE = 'http://localhost:5221/api';
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const token = sign({ userId: 1 });
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
const MARK = '[MOCK]';

const api = async (method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (r.status >= 400) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const fmt = d => d.toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  // Make sure the server is up
  await api('GET', '/auth/me');

  const inv = await api('GET', '/inventory');
  const stations = await api('GET', '/stations');
  const stIds = stations.slice(0, 50).map(s => s.id);

  const projects = [
    'โครงการบำรุงรักษา WIM ปี 2569',
    'งานติดตั้งระบบชั่งน้ำหนัก M81',
    'งานซ่อมบำรุงด่านชั่งน้ำหนัก',
    'โครงการอัปเกรดกล้อง LPR',
    'งานตรวจสอบประจำไตรมาส',
  ];
  const companies = [
    'บริษัท ไอที โซลูชั่น แอนด์ เซอร์วิส จำกัด',
    'บริษัท เน็ตเวิร์ค ซิสเต็มส์ คอร์ปอเรชัน จำกัด',
    'บริษัท พาวเวอร์ แอนด์ อินสตรูเมนท์ เทคโนโลยี จำกัด',
  ];
  const regularTypes = ['เบิกใช้งาน', 'ซ่อมแซม'];
  const borrowTypes = ['ยืมใช้งาน', 'ทดสอบ', 'สำรองใช้งาน'];

  // 1) Withdrawals (mix of regular + borrow/return-tracked)
  let nW = 0, nBorrow = 0;
  for (let i = 0; i < 14; i++) {
    const item = pick(inv);
    const isBorrow = i % 3 === 0;
    const type = isBorrow ? pick(borrowTypes) : pick(regularTypes);
    const body = {
      type,
      note: `${MARK} ตัวอย่างการเบิก #${i + 1}`,
      items: [{ inventory_id: item.id, quantity: rand(1, 2), serial_numbers: [] }],
      project_name: pick(projects),
      station_id: pick(stIds),
    };
    if (isBorrow) {
      body.return_due_date = new Date(Date.now() + pick([7, 15, 30]) * 86400000).toISOString().slice(0, 10);
      nBorrow++;
    }
    await api('POST', '/withdrawals', body);
    nW++; process.stdout.write('.');
  }

  // 2) Inbound stock additions (ledger ADD_STOCK)
  let nAdd = 0;
  for (let i = 0; i < 3; i++) {
    await api('POST', '/transactions/add-stock', {
      inventory_id: pick(inv).id, quantity: rand(2, 5),
      note: `${MARK} รับเข้าสต็อกเพิ่มเติม`, serial_numbers: [],
    });
    nAdd++; process.stdout.write('+');
  }

  // 3) Purchase orders in varied statuses
  const statuses = ['Draft', 'Pending', 'Approved'];
  let nPo = 0;
  for (let i = 0; i < 3; i++) {
    const a = pick(inv), b = pick(inv);
    const items = [{ inventory_id: a.id, quantity: rand(3, 8), unit_price: 0 }];
    if (b.id !== a.id) items.push({ inventory_id: b.id, quantity: rand(2, 5), unit_price: 0 });
    await api('POST', '/purchase-orders', {
      note: `${MARK} ใบสั่งซื้อตัวอย่าง ${i + 1}`, items,
      ordered_by: 'System Administrator', project_name: pick(projects),
      company_name: pick(companies), status: statuses[i], created_by: 'System Administrator',
    });
    nPo++; process.stdout.write('#');
  }

  console.log(`\nAPI seeding done — withdrawals:${nW} (borrow:${nBorrow}), add-stock:${nAdd}, POs:${nPo}`);
  console.log('Spreading dates across the last 60 days...');

  // 4) Backdate created_at for all MOCK records (and keep borrow due dates consistent)
  const db = new sqlite3.Database(dbPath);
  const run = (sql, p = []) => new Promise((rs, rj) => db.run(sql, p, function (e) { e ? rj(e) : rs(this); }));
  const all = (sql, p = []) => new Promise((rs, rj) => db.all(sql, p, (e, r) => e ? rj(e) : rs(r)));

  const ws = await all(`SELECT id, return_due_date FROM withdrawals WHERE note LIKE '%${MARK}%'`);
  for (const w of ws) {
    const d = new Date(Date.now() - rand(1, 60) * 86400000 - rand(0, 86400) * 1000);
    const ts = fmt(d);
    if (w.return_due_date) {
      // due = borrow date + 7..30 days → naturally yields a mix of overdue / still-pending
      const due = new Date(d.getTime() + rand(7, 30) * 86400000).toISOString().slice(0, 10);
      await run(`UPDATE withdrawals SET created_at=?, return_due_date=? WHERE id=?`, [ts, due, w.id]);
    } else {
      await run(`UPDATE withdrawals SET created_at=? WHERE id=?`, [ts, w.id]);
    }
    await run(`UPDATE inventory_transactions SET created_at=? WHERE withdrawal_id=?`, [ts, w.id]);
  }
  const txs = await all(`SELECT id FROM inventory_transactions WHERE note LIKE '%${MARK}%' AND withdrawal_id IS NULL`);
  for (const t of txs) {
    await run(`UPDATE inventory_transactions SET created_at=? WHERE id=?`, [fmt(new Date(Date.now() - rand(1, 60) * 86400000)), t.id]);
  }
  const pos = await all(`SELECT id FROM purchase_orders WHERE note LIKE '%${MARK}%'`);
  for (const p of pos) {
    await run(`UPDATE purchase_orders SET created_at=? WHERE id=?`, [fmt(new Date(Date.now() - rand(1, 60) * 86400000)), p.id]);
  }
  db.close();
  console.log(`Backdated ${ws.length} withdrawals, ${txs.length} stock-ins, ${pos.length} POs. Done ✅`);
})().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
