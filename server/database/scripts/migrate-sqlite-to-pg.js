// One-off operational tool for Stage 4 of the SQLite → PostgreSQL migration.
// Copies all rows from the SQLite .db file into the already-migrated Postgres
// schema (run `migrations-pg` first), preserving original primary keys, then
// resets each table's sequence so new inserts continue from the right value.
//
// Usage (rehearsal, against a scratch Postgres DB):
//   DATABASE_URL=postgres://... node database/scripts/migrate-sqlite-to-pg.js [path/to/repair_system.db]
//
// Safe to re-run: uses ON CONFLICT DO NOTHING, so already-migrated rows are skipped.
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const BATCH_SIZE = 500;

// Parent tables before child tables (matches server/database/migrations-pg ordering).
const TABLES_IN_ORDER = [
  'companies', 'stations', 'station_areas', 'inventory', 'contracts', 'users',
  'repairs', 'repair_logs', 'device_changes', 'repair_images',
  'inventory_instances', 'station_asset_status',
  'withdrawals', 'withdrawal_items', 'inventory_transactions',
  'purchase_orders', 'purchase_order_items', 'company_logos',
  'audit_logs', 'system_settings', 'sequences'
];

const RESERVED_COLUMN_NAMES = new Set(['user']);
const quoteCol = (c) => (RESERVED_COLUMN_NAMES.has(c) ? `"${c}"` : c);

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function sqliteColumns(db, table) {
  const rows = await sqliteAll(db, `PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

async function migrateTable(sqliteDb, pgPool, table) {
  const columns = await sqliteColumns(sqliteDb, table);
  if (columns.length === 0) {
    console.log(`  ${table}: not found in source DB (skip)`);
    return 0;
  }

  const orderCol = columns.includes('id') ? 'id' : columns[0];
  const rows = await sqliteAll(sqliteDb, `SELECT * FROM ${table} ORDER BY ${orderCol}`);

  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }

  const colList = columns.map(quoteCol).join(', ');

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesSql = batch
      .map((_, bi) => `(${columns.map((__, ci) => `$${bi * columns.length + ci + 1}`).join(', ')})`)
      .join(', ');
    const params = [];
    batch.forEach((row) => columns.forEach((c) => params.push(row[c])));

    await pgPool.query(
      `INSERT INTO ${table} (${colList}) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
      params
    );
  }

  if (columns.includes('id')) {
    await pgPool.query(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${table}), 1),
        (SELECT MAX(id) FROM ${table}) IS NOT NULL
      )
    `);
  }

  console.log(`  ${table}: migrated ${rows.length} rows`);
  return rows.length;
}

async function run() {
  const sqlitePath = process.argv[2] || path.join(__dirname, '..', 'repair_system.db');
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (target Postgres database).');
    process.exit(1);
  }

  console.log(`Source (SQLite): ${sqlitePath}`);
  console.log(`Target (Postgres): ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);
  console.log('');

  const sqliteDb = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
  // SQLite's CURRENT_TIMESTAMP is naive UTC text ("2026-07-01 09:03:49"). Force
  // the session to UTC so Postgres interprets those naive strings as UTC
  // instead of the server locale (Asia/Bangkok on this host), which would
  // otherwise silently shift every migrated timestamp by 7 hours.
  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' });

  const summary = {};
  try {
    for (const table of TABLES_IN_ORDER) {
      summary[table] = await migrateTable(sqliteDb, pgPool, table);
    }
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }

  console.log('\n--- Migration summary ---');
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.table(summary);
  console.log(`Total rows migrated: ${total}`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('MIGRATION FAILED:', err);
    process.exitCode = 1;
  });
}

module.exports = { run, TABLES_IN_ORDER };
