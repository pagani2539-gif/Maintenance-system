const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations-pg');

// Postgres error codes safe to treat as "already applied" if a migration
// is re-run outside the normal schema_migrations tracking (e.g. manual psql runs).
const TOLERABLE_CODES = new Set([
  '42701', // duplicate_column
  '42P07', // duplicate_table
  '42710', // duplicate_object (index/constraint)
]);

async function runMigrationsPg(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        run_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
    const appliedNames = new Set(applied.map((r) => r.name));

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort();

    for (const file of files) {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      if (appliedNames.has(migration.name)) continue;

      console.log(`Running migration: ${migration.name}`);
      try {
        await client.query('BEGIN');
        await migration.up(client);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        if (TOLERABLE_CODES.has(err.code)) {
          console.warn(`Migration ${migration.name} reported "${err.message}" — treating as already applied.`);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [migration.name]);
          continue;
        }
        throw err;
      }
    }

    console.log('All PostgreSQL migrations applied.');
  } finally {
    client.release();
  }
}

module.exports = { runMigrationsPg };
