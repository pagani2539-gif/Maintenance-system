/**
 * One-time renumber of all existing document numbers to the unified scheme
 * "PREFIX-YYMMDD-NNN" (2-digit Buddhist-era year, Bangkok date, daily running seq):
 *   repairs (type=repair) -> RP-YYMMDD-NNN
 *   repairs (type=claim)  -> CL-YYMMDD-NNN
 *   purchase_orders       -> PO-YYMMDD-NNN
 * Each record keeps its own created_at date; the sequence resets per day.
 * Withdrawals keep their id-based "WD-000000" display (already short/clean).
 *
 * Safe: ticket_no / po_no are display strings, not foreign keys.
 * For a rollback, restore the auto-backup in server/database/backups/.
 *
 * Run: node scripts/renumber_documents.js
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);
const all = (s, p = []) => new Promise((rs, rj) => db.all(s, p, (e, r) => e ? rj(e) : rs(r)));
const run = (s, p = []) => new Promise((rs, rj) => db.run(s, p, function (e) { e ? rj(e) : rs(this); }));

// "2026-06-15 ..." -> "690615"  (พ.ศ. 2-digit + MMDD)
function datePart(createdAt) {
  const m = String(createdAt || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const yy = String((parseInt(m[1], 10) + 543) % 100).padStart(2, '0');
  return `${yy}${m[2]}${m[3]}`;
}

(async () => {
  await run('PRAGMA busy_timeout=5000');
  const counters = {};
  const nextNo = (prefix, dp) => {
    const key = prefix + dp;
    counters[key] = (counters[key] || 0) + 1;
    return `${prefix}-${dp}-${String(counters[key]).padStart(3, '0')}`;
  };

  // ticket_no / po_no are UNIQUE, so park every row on a temp value first to
  // avoid mid-update collisions, then assign the final numbers.
  await run(`UPDATE repairs SET ticket_no = 'TMP-' || id`);
  await run(`UPDATE purchase_orders SET po_no = 'TMP-' || id`);

  // Repairs + claims (ordered oldest→newest so sequence is chronological)
  const reps = await all(`SELECT id, created_at, type FROM repairs ORDER BY datetime(created_at) ASC, id ASC`);
  let rp = 0, cl = 0;
  for (const r of reps) {
    const dp = datePart(r.created_at);
    if (!dp) continue;
    const prefix = r.type === 'claim' ? 'CL' : 'RP';
    const no = nextNo(prefix, dp);
    await run('UPDATE repairs SET ticket_no=? WHERE id=?', [no, r.id]);
    if (prefix === 'CL') cl++; else rp++;
  }

  // Purchase orders
  const pos = await all(`SELECT id, created_at FROM purchase_orders ORDER BY datetime(created_at) ASC, id ASC`);
  let po = 0;
  for (const p of pos) {
    const dp = datePart(p.created_at);
    if (!dp) continue;
    await run('UPDATE purchase_orders SET po_no=? WHERE id=?', [nextNo('PO', dp), p.id]);
    po++;
  }

  db.close();
  console.log(`Renumbered: ${rp} repairs (RP), ${cl} claims (CL), ${po} purchase orders (PO).`);
})().catch(e => { console.error('RENUMBER ERROR:', e.message); process.exit(1); });
