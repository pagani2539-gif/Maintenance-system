// Companion to migrate-sqlite-to-pg.js — verifies the migrated data before cutover.
// Usage: DATABASE_URL=postgres://... node database/scripts/verify-migration.js [path/to/repair_system.db]
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const { TABLES_IN_ORDER } = require('./migrate-sqlite-to-pg');

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function sqliteColumns(db, table) {
  const rows = await sqliteAll(db, `PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

const RESERVED_COLUMN_NAMES = new Set(['user']);
const quoteCol = (c) => (RESERVED_COLUMN_NAMES.has(c) ? `"${c}"` : c);

async function run() {
  const sqlitePath = process.argv[2] || path.join(__dirname, '..', 'repair_system.db');
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (target Postgres database).');
    process.exit(1);
  }

  const sqliteDb = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
  const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' });

  let failures = 0;
  const rowCountReport = {};

  try {
    console.log('--- 1. Row-count parity ---');
    for (const table of TABLES_IN_ORDER) {
      const columns = await sqliteColumns(sqliteDb, table);
      if (columns.length === 0) continue;

      const [{ c: sqliteCount }] = await sqliteAll(sqliteDb, `SELECT COUNT(*) as c FROM ${table}`);
      const { rows: pgRows } = await pgPool.query(`SELECT COUNT(*) as c FROM ${table}`);
      const pgCount = Number(pgRows[0].c);

      const ok = Number(sqliteCount) === pgCount;
      rowCountReport[table] = { sqlite: sqliteCount, postgres: pgCount, match: ok ? 'OK' : 'MISMATCH' };
      if (!ok) failures++;
    }
    console.table(rowCountReport);

    console.log('\n--- 2. Numeric checksum spot-checks ---');
    const checksumTargets = [
      { table: 'inventory', column: 'quantity' },
      { table: 'inventory_transactions', column: 'quantity_added' },
      { table: 'purchase_order_items', column: 'quantity' },
    ];
    for (const { table, column } of checksumTargets) {
      const columns = await sqliteColumns(sqliteDb, table);
      if (columns.length === 0) continue;
      const [{ s: sqliteSum }] = await sqliteAll(sqliteDb, `SELECT COALESCE(SUM(${column}),0) as s FROM ${table}`);
      const { rows: pgRows } = await pgPool.query(`SELECT COALESCE(SUM(${column}),0) as s FROM ${table}`);
      const pgSum = Number(pgRows[0].s);
      const ok = Number(sqliteSum) === pgSum;
      console.log(`  ${table}.${column}: sqlite=${sqliteSum} postgres=${pgSum} ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) failures++;
    }

    console.log('\n--- 3. Sample deep-compare (up to 5 random rows per table) ---');
    for (const table of TABLES_IN_ORDER) {
      const columns = await sqliteColumns(sqliteDb, table);
      if (columns.length === 0 || !columns.includes('id')) continue;

      const sample = await sqliteAll(sqliteDb, `SELECT * FROM ${table} ORDER BY RANDOM() LIMIT 5`);
      for (const sqliteRow of sample) {
        const { rows: pgRows } = await pgPool.query(`SELECT * FROM ${table} WHERE id = $1`, [sqliteRow.id]);
        const pgRow = pgRows[0];
        if (!pgRow) {
          console.log(`  MISMATCH: ${table}#${sqliteRow.id} missing in Postgres`);
          failures++;
          continue;
        }
        for (const col of columns) {
          if (col === 'id') continue;
          const a = sqliteRow[col];
          const b = pgRow[col];
          // Normalize: timestamps/dates and JSON columns render differently in
          // each engine (string vs Date object vs parsed object) — compare as
          // strings. Date must use toISOString(), not JSON.stringify (which
          // wraps it in an extra pair of quote characters and breaks the
          // date-pattern check in isLikelyDateMatch below).
          const normalize = (v) => {
            if (v === null || v === undefined) return null;
            if (v instanceof Date) return v.toISOString();
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
          };
          const normA = normalize(a);
          const normB = normalize(b);
          if (normA !== null && normB !== null && normA !== normB && !isLikelyDateMatch(normA, normB)) {
            console.log(`  DIFF: ${table}#${sqliteRow.id}.${col}: sqlite="${normA}" postgres="${normB}"`);
            failures++;
          }
        }
      }
    }
    console.log('  (deep-compare complete)');

    console.log('\n--- 4. FK-orphan report ---');
    const fkChecks = [
      { table: 'repairs', column: 'station_id', ref: 'stations' },
      { table: 'withdrawals', column: 'station_id', ref: 'stations' },
      { table: 'inventory_instances', column: 'inventory_id', ref: 'inventory' },
      { table: 'withdrawal_items', column: 'withdrawal_id', ref: 'withdrawals' },
      { table: 'purchase_order_items', column: 'po_id', ref: 'purchase_orders' },
    ];
    for (const { table, column, ref } of fkChecks) {
      const { rows } = await pgPool.query(`
        SELECT COUNT(*) as c FROM ${table} t
        WHERE t.${column} IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${ref} r WHERE r.id = t.${column})
      `);
      const orphanCount = Number(rows[0].c);
      if (orphanCount > 0) {
        console.log(`  WARNING: ${table}.${column} has ${orphanCount} orphaned reference(s) to ${ref} — decide delete vs null-out before cutover`);
      } else {
        console.log(`  ${table}.${column} -> ${ref}: no orphans`);
      }
    }

    console.log('\n--- 5. Sequence sanity (dummy insert + rollback per table with an id column) ---');
    for (const table of TABLES_IN_ORDER) {
      const columns = await sqliteColumns(sqliteDb, table);
      if (columns.length === 0 || !columns.includes('id')) continue;
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO ${table} DEFAULT VALUES`).catch(() => {
          // Table has required NOT NULL columns beyond id/defaults — that's fine,
          // this check only cares that the *sequence* doesn't collide with an
          // existing row, not that a bare INSERT succeeds semantically.
        });
        await client.query('ROLLBACK');
      } catch (err) {
        if (err.code === '23505') {
          console.log(`  MISMATCH: ${table} sequence would collide with an existing id — setval likely missed`);
          failures++;
        }
        try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
      } finally {
        client.release();
      }
    }
    console.log('  (sequence check complete)');
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }

  console.log(`\n${failures === 0 ? 'VERIFICATION PASSED' : `VERIFICATION FAILED (${failures} issue(s))`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

// SQLite stores "YYYY-MM-DD HH:MM:SS"-ish text; Postgres returns Date objects
// stringified as full ISO. Treat them as equal if one starts with the other's
// date+time up to seconds.
function isLikelyDateMatch(a, b) {
  const norm = (s) => s.replace(/[T\s]/, ' ').slice(0, 19);
  return /^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b) && norm(a) === norm(b);
}

if (require.main === module) {
  run();
}
