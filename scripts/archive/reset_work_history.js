/**
 * Reset operational work history (repairs / claims / withdrawals / transactions / POs)
 * while PRESERVING configuration:
 *   - users (admin + manually created accounts)
 *   - companies + company_logos
 *   - stations + station_areas
 *   - inventory items (master products)
 *   - schema_migrations
 *
 * Use when test/seed data has scrambled IDs and you want a clean slate
 * for live work without re-running migrations.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const uploadsDir = path.join(__dirname, '../server/uploads');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  process.exit(1);
}

// Backup before destructive operation
const backupPath = path.join(__dirname, '../server/database/backup_before_reset_' + Date.now() + '.db');
fs.copyFileSync(dbPath, backupPath);
console.log(`Backup saved: ${backupPath}`);

const db = new sqlite3.Database(dbPath);

// Order matters — child tables first to satisfy FK constraints
const tablesToClear = [
  'audit_logs',
  'repair_logs',
  'repair_images',
  'device_changes',
  'repairs',
  'withdrawal_items',
  'withdrawals',
  'inventory_transactions',
  'inventory_instances',
  'purchase_order_items',
  'purchase_orders',
];

// Optional: reset stock quantity on inventory (history is gone, current count is meaningless)
const resetInventoryStock = true;

db.serialize(() => {
  console.log('\n--- Resetting work history ---');

  db.run('PRAGMA foreign_keys = OFF;');

  for (const table of tablesToClear) {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) console.error(`  ✗ ${table}: ${err.message}`);
      else console.log(`  ✓ Cleared ${table}`);
    });
    db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
  }

  if (resetInventoryStock) {
    db.run(`UPDATE inventory SET quantity = 0`, (err) => {
      if (err) console.error(`  ✗ inventory.quantity reset: ${err.message}`);
      else console.log(`  ✓ Reset inventory.quantity to 0`);
    });
  }

  db.run('PRAGMA foreign_keys = ON;');

  // Clean up uploaded files tied to cleared records
  // (logos at uploads/logos/ are preserved — that subdir is left alone)
  if (fs.existsSync(uploadsDir)) {
    const entries = fs.readdirSync(uploadsDir);
    let deleted = 0;
    for (const entry of entries) {
      const fullPath = path.join(uploadsDir, entry);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isFile() && entry !== '.gitkeep') {
          fs.unlinkSync(fullPath);
          deleted++;
        }
      } catch (err) {
        console.error(`  ✗ delete ${entry}: ${err.message}`);
      }
    }
    console.log(`  ✓ Removed ${deleted} files from uploads/ (logos/ subdir kept)`);
  }

  console.log('\n--- Done ---');
  console.log('Preserved: users, companies, company_logos, stations, station_areas, inventory definitions');
  console.log('Restart the server, then create new records — IDs will start from 1 in order.\n');
});

db.close();
