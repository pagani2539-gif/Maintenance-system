// Vitest globalSetup — runs once, in its own process context, before any test file.
// Ensures the Postgres test database schema is up to date before tests connect.
module.exports = async () => {
  process.env.NODE_ENV = 'test';
  require('../utils/loadEnv')();

  const { pool } = require('../database/db');
  const { runMigrationsPg } = require('../database/migrationRunnerPg');

  await runMigrationsPg(pool);
  await pool.end();
};
