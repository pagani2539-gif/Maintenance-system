/**
 * Round 2 mock data + live functional tests.
 *  - Adds new inventory item types and boosts stock on existing ones (with S/N).
 *  - Fills the still-empty corners: claims, actual returns, a received PO, retro S/N.
 *  - Exercises real endpoints and prints PASS/FAIL so we can see features work.
 *
 * Everything created is tagged "[MOCK]" (inventory uses it in `description`,
 * repairs/claims in `problem`) so scripts/clear_mock_activity.js can remove it.
 *
 * Requires the backend dev server running on 5221.
 * Run: node scripts/seed_mock_extra.js
 */
const path = require('path');
const { sign } = require(path.join(__dirname, '../server/utils/jwt'));
const sqlite3 = require('sqlite3').verbose();

const BASE = 'http://localhost:5221/api';
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const token = sign({ userId: 1 });
const AUTH = { Authorization: 'Bearer ' + token };
const JH = { 'Content-Type': 'application/json', ...AUTH };
const MARK = '[MOCK]';

const api = async (method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: JH, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (r.status >= 400) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sn = (prefix) => `${prefix}${Date.now().toString().slice(-6)}${rand(100, 999)}`;
const tag = `T${Date.now().toString().slice(-5)}`;

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  ✓ PASS  ${name}`); pass++; }
  catch (e) { console.log(`  ✗ FAIL  ${name} — ${e.message}`); fail++; }
};

(async () => {
  await api('GET', '/auth/me');
  const stations = await api('GET', '/stations');
  const stIds = stations.slice(0, 40).map(s => s.id);
  const origInv = await api('GET', '/inventory');           // the items that existed before this run
  const origIds = origInv.map(i => i.id);

  // ---------- PART A: more inventory + more stock ----------
  console.log('\n[A] Adding inventory item types + boosting stock');

  const NEW_ITEMS = [
    { name: 'Load Cell (HBM)', model: 'HBM C16i', qty: 40, min: 10, prefix: 'LC-HBM-', desc: 'เซลล์รับน้ำหนักความแม่นยำสูงสำหรับแท่นชั่ง WIM' },
    { name: 'Fiber Optic Converter (Moxa)', model: 'Moxa IMC-101', qty: 30, min: 8, prefix: 'FOC-MX-', desc: 'อุปกรณ์แปลงสัญญาณไฟเบอร์ออปติกสำหรับเครือข่ายด่านชั่ง' },
    { name: 'Traffic Barrier Gate (CAME)', model: 'CAME GARD 4', qty: 14, min: 4, prefix: 'GATE-CM-', desc: 'ไม้กั้นอัตโนมัติทางเข้า-ออกด่านชั่งน้ำหนัก' },
    { name: 'LED Traffic Display (Daktronics)', model: 'Daktronics VF-2020', qty: 12, min: 4, prefix: 'LED-DK-', desc: 'จอแสดงผล LED แจ้งสถานะน้ำหนักรถบรรทุก' },
    { name: 'Network Video Recorder (Hikvision)', model: 'Hikvision DS-9664NI', qty: 18, min: 5, prefix: 'NVR-HK-', desc: 'เครื่องบันทึกภาพกล้องวงจรปิดความจุสูง 64 ช่อง' },
    { name: 'Solar Charge Controller (Victron)', model: 'Victron SmartSolar 150/85', qty: 22, min: 6, prefix: 'SCC-VT-', desc: 'ตัวควบคุมการชาร์จพลังงานแสงอาทิตย์สำหรับสถานีนอกพื้นที่ไฟฟ้า' },
    { name: 'Inductive Loop Detector (Feig)', model: 'Feig VEK MNE1', qty: 35, min: 10, prefix: 'ILD-FG-', desc: 'เซนเซอร์ตรวจจับยานพาหนะแบบลูปเหนี่ยวนำใต้ผิวถนน' },
  ];

  for (const it of NEW_ITEMS) {
    await test(`create inventory "${it.name}" (qty ${it.qty}, +S/N)`, async () => {
      const sns = Array.from({ length: Math.min(it.qty, 12) }, () => sn(it.prefix));
      const fd = new FormData();
      fd.append('name', it.name);
      fd.append('model', it.model);
      fd.append('description', `${it.desc} ${MARK}`);
      fd.append('quantity', String(it.qty));
      fd.append('min_stock', String(it.min));
      fd.append('requires_sn', '1');
      fd.append('storage_location', pick(['ตู้ A1 ชั้น 1', 'ตู้ B2 ชั้น 2', 'ตู้ C3 ชั้น 1', 'คลังกลาง']));
      fd.append('serial_numbers', JSON.stringify(sns));
      const r = await fetch(BASE + '/inventory', { method: 'POST', headers: AUTH, body: fd });
      if (r.status >= 400) throw new Error(`${r.status} ${await r.text()}`);
    });
  }

  // Boost stock on the original items (also exercises add-stock with S/N → instance creation)
  for (const item of origInv) {
    await test(`add-stock +S/N to "${item.name}"`, async () => {
      const add = rand(10, 25);
      const sns = Array.from({ length: Math.min(add, 8) }, () => sn('RESTOCK-'));
      await api('POST', '/transactions/add-stock', {
        inventory_id: item.id, quantity: add, note: `${MARK} เติมสต็อกรอบ 2`, serial_numbers: sns,
      });
    });
  }

  // ---------- PART B: fill remaining gaps + functional tests ----------
  console.log('\n[B] Functional tests on real endpoints');

  // B1. Create mock repairs + claims (claims module was empty of mock data)
  const mkTicketBody = (n) => ({
    station_id: pick(stIds),
    device_name: pick(['กล้อง LPR ช่องทาง 2', 'คอมพิวเตอร์ควบคุมด่าน', 'Load Cell แท่นชั่ง', 'จอแสดงผล LED', 'ตู้ควบคุมไฟฟ้า']),
    problem: `${MARK} อาการทดสอบ #${n}: ${pick(['ไม่จ่ายไฟ', 'ภาพไม่ขึ้น', 'ค่าน้ำหนักเพี้ยน', 'การ์ดเครือข่ายเสีย', 'เซนเซอร์ไม่ตอบสนอง'])}`,
    priority: pick(['ปกติ', 'ด่วน', 'ด่วนมาก']),
    project_name: 'โครงการบำรุงรักษา WIM ปี 2569',
  });

  const mockRepairIds = [];
  for (let i = 1; i <= 3; i++) {
    await test(`create repair ticket #${i}`, async () => {
      const r = await api('POST', '/repairs', mkTicketBody(i));
      mockRepairIds.push(r.id);
    });
  }
  for (let i = 1; i <= 3; i++) {
    await test(`create claim ticket #${i}`, async () => {
      await api('POST', '/repairs/claim', mkTicketBody(`C${i}`));
    });
  }

  // B2. Status workflow on a mock repair (รอดำเนินการ → กำลังซ่อม → เสร็จสิ้น)
  if (mockRepairIds[0]) {
    await test('update repair status → กำลังซ่อม', async () => {
      await api('PATCH', `/repairs/${mockRepairIds[0]}/status`, { status: 'กำลังซ่อม', repair_note: `${MARK} เริ่มดำเนินการซ่อม` });
    });
    await test('update repair status → เสร็จสิ้น', async () => {
      await api('PATCH', `/repairs/${mockRepairIds[0]}/status`, { status: 'เสร็จสิ้น', repair_note: `${MARK} ซ่อมเสร็จเรียบร้อย` });
    });
  }

  // B3. Return borrowed items (the return flow was completely untested)
  const pending = await api('GET', '/transactions?pending_only=true');
  const toReturn = pending.slice(0, 2);
  for (const tx of toReturn) {
    await test(`return borrowed item (tx #${tx.id})`, async () => {
      await api('POST', '/transactions/return', {
        inventory_id: tx.inventory_id,
        quantity: tx.quantity_withdrawn || tx.quantity_borrowed || 1,
        condition: pick(['ปกติ', 'มีตำหนิเล็กน้อย']),
        note: `${MARK} คืนอุปกรณ์หลังใช้งาน`,
        transaction_id: tx.id,
      });
    });
  }

  // B4. Receive an Approved PO (receiving workflow → inbound stock)
  const pos = await api('GET', '/purchase-orders');
  const approved = pos.find(p => p.status === 'Approved');
  if (approved) {
    await test(`receive approved PO ${approved.po_no}`, async () => {
      await api('POST', `/purchase-orders/${approved.id}/receive`, {});
    });
  } else {
    console.log('  – skip receive PO (no Approved PO found)');
  }

  // B5. Retro-add S/N to a bulk withdrawal item
  const withdrawals = await api('GET', '/withdrawals');
  const mockW = withdrawals.find(w => (w.note || '').includes(MARK));
  if (mockW) {
    await test(`retro add S/N to withdrawal #${mockW.id}`, async () => {
      const full = await api('GET', `/withdrawals/${mockW.id}`);
      const item = full.items && full.items[0];
      if (!item) throw new Error('no items on withdrawal');
      await api('PUT', `/withdrawals/${mockW.id}/items/${item.id}/serial-numbers`, {
        serial_numbers: [sn('RETRO-')],
      });
    });
  }

  // ---------- backdate the new mock repairs/claims so they spread out ----------
  const db = new sqlite3.Database(dbPath);
  const run = (s, p = []) => new Promise((rs, rj) => db.run(s, p, function (e) { e ? rj(e) : rs(this); }));
  await run('PRAGMA busy_timeout=5000');
  const fmt = d => d.toISOString().slice(0, 19).replace('T', ' ');
  await new Promise(r => db.all(`SELECT id FROM repairs WHERE problem LIKE '%${MARK}%'`, async (e, rows) => {
    for (const row of (rows || [])) {
      const d = new Date(Date.now() - rand(1, 45) * 86400000);
      await run('UPDATE repairs SET created_at=?, received_at=? WHERE id=?', [fmt(d), fmt(d), row.id]);
    }
    db.close();
    console.log(`\n========================================`);
    console.log(`RESULT: ${pass} passed, ${fail} failed`);
    console.log(`========================================`);
    process.exit(fail > 0 ? 1 : 0);
  }));
})().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
