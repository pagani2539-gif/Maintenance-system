// Vitest globalSetup — runs once, in its own process context, before any test file.
// Ensures the Postgres test database schema is up to date before tests connect.
module.exports = async () => {
  process.env.NODE_ENV = 'test';
  require('../utils/loadEnv')();

  if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is required; refusing to run tests against the production database.');
  }
  if (!process.env.PG_TEST_SCHEMA) {
    throw new Error('PG_TEST_SCHEMA is required; refusing to run tests without an isolated test schema.');
  }

  const { pool } = require('../database/db');
  const { runMigrationsPg } = require('../database/migrationRunnerPg');

  await runMigrationsPg(pool);
  await pool.end();
};
