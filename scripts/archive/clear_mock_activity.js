/**
 * Removes everything created by scripts/seed_mock_activity.js (records tagged "[MOCK]")
 * and restores inventory stock to its pre-seed levels.
 *
 * Safe to run while the server is up (uses a busy timeout). Does NOT touch any
 * real data — only rows whose note contains "[MOCK]".
 *
 * Run: node scripts/clear_mock_activity.js
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const MARK = '[MOCK]';

const db = new sqlite3.Database(dbPath);
const run = (s, p = []) => new Promise((rs, rj) => db.run(s, p, function (e) { e ? rj(e) : rs(this); }));
const all = (s, p = []) => new Promise((rs, rj) => db.all(s, p, (e, r) => e ? rj(e) : rs(r)));

(async () => {
  await run('PRAGMA busy_timeout=5000');

  // 1) Restore stock: add back what was withdrawn, remove what was added — BEFORE deleting the rows
  const deltas = await all(
    `SELECT inventory_id,
            SUM(COALESCE(quantity_withdrawn,0)) AS wd,
            SUM(COALESCE(quantity_added,0))     AS ad
     FROM inventory_transactions
     WHERE note LIKE '%${MARK}%'
     GROUP BY inventory_id`
  );
  for (const d of deltas) {
    const restore = (d.wd || 0) - (d.ad || 0);
    if (restore !== 0) await run('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [restore, d.inventory_id]);
  }

  // 2) Delete mock withdrawals + their items + their transactions
  const ws = await all(`SELECT id FROM withdrawals WHERE note LIKE '%${MARK}%'`);
  for (const w of ws) {
    await run('DELETE FROM inventory_transactions WHERE withdrawal_id = ?', [w.id]);
    await run('DELETE FROM withdrawal_items WHERE withdrawal_id = ?', [w.id]);
    await run('DELETE FROM withdrawals WHERE id = ?', [w.id]);
  }

  // 3) Delete standalone mock transactions (the add-stock entries)
  const txRes = await run(`DELETE FROM inventory_transactions WHERE note LIKE '%${MARK}%'`);

  // 4) Delete mock purchase orders + their items
  const pos = await all(`SELECT id FROM purchase_orders WHERE note LIKE '%${MARK}%'`);
  for (const p of pos) {
    await run('DELETE FROM purchase_order_items WHERE po_id = ?', [p.id]);
    await run('DELETE FROM purchase_orders WHERE id = ?', [p.id]);
  }

  // 5) Delete mock repairs / claims (tagged in `problem`) + their child rows
  const reps = await all(`SELECT id FROM repairs WHERE problem LIKE '%${MARK}%'`);
  for (const r of reps) {
    await run('DELETE FROM repair_logs WHERE repair_id = ?', [r.id]);
    await run('DELETE FROM repair_images WHERE repair_id = ?', [r.id]);
    await run('DELETE FROM device_changes WHERE repair_id = ?', [r.id]);
    await run('DELETE FROM repairs WHERE id = ?', [r.id]);
  }

  // 6) Delete mock inventory instances (new-item S/N + restock/retro S/N) and mock inventory items
  await run(`DELETE FROM inventory_instances WHERE serial_number LIKE 'RESTOCK-%' OR serial_number LIKE 'RETRO-%'`);
  const mockItems = await all(`SELECT id FROM inventory WHERE description LIKE '%${MARK}%'`);
  for (const it of mockItems) {
    await run('DELETE FROM inventory_instances WHERE inventory_id = ?', [it.id]);
    await run('DELETE FROM inventory WHERE id = ?', [it.id]);
  }

  console.log(`Removed: withdrawals=${ws.length}, add-stock tx=${txRes.changes}, mock POs=${pos.length}, repairs/claims=${reps.length}, inventory items=${mockItems.length}; partial stock restore for ${deltas.length} item(s).`);
  console.log('Note 1: auto-generated POs (low-stock trigger, untagged) are left intact — delete in the UI if not needed.');
  console.log('Note 2: stock on the ORIGINAL items is only best-effort restored (returns/PO-receive also moved stock).');
  console.log('         For an exact reset, restore the auto-backup taken at server start (server/database/backups/).');
  db.close();
})().catch(e => { console.error('CLEANUP ERROR:', e.message); process.exit(1); });
