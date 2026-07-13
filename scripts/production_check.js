const fs = require('fs');
const path = require('path');

require('../server/utils/loadEnv')();

const root = path.join(__dirname, '..');
const checks = [];
const DEFAULT_OFFSITE_BACKUP_DIR = 'database/offsite-backups';

const addCheck = (name, ok, detail) => {
  checks.push({ name, ok, detail });
};

const resolveOffsiteBackupDir = (configuredDir = DEFAULT_OFFSITE_BACKUP_DIR) => (
  path.isAbsolute(configuredDir)
    ? configuredDir
    : path.resolve(root, 'server', configuredDir)
);

const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

async function main() {
  addCheck('NODE_ENV=production', process.env.NODE_ENV === 'production', `NODE_ENV=${process.env.NODE_ENV || '(empty)'}`);
  addCheck('JWT_SECRET is set', Boolean(process.env.JWT_SECRET), 'Required for production auth tokens');
  addCheck(
    'JWT_SECRET is not placeholder',
    process.env.JWT_SECRET && process.env.JWT_SECRET !== 'replace-with-a-long-random-secret',
    'Use a long random value'
  );
  addCheck('server/.env exists', exists('server/.env'), 'Local production environment file');
  addCheck('client/dist exists', exists('client/dist/index.html'), 'Run npm.cmd run build in client');
  addCheck('DATABASE_URL is set', Boolean(process.env.DATABASE_URL), 'PostgreSQL connection string required');
  addCheck(
    'DATABASE_URL is not placeholder',
    Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL.includes('replace-with-app-role-password'),
    'Use the real maintenance_app role connection string'
  );

  if (process.env.DATABASE_URL) {
    try {
      const { query, closePool } = require('../server/database/db');
      await query('SELECT 1');
      addCheck('PostgreSQL is reachable', true, process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@'));
      await closePool();
    } catch (err) {
      addCheck('PostgreSQL is reachable', false, err.message);
    }
  }

  addCheck(
    'PG_BIN_DIR is set (for backup/restore)',
    Boolean(process.env.PG_BIN_DIR) && fs.existsSync(process.env.PG_BIN_DIR),
    process.env.PG_BIN_DIR ? `pg_dump/pg_restore expected in ${process.env.PG_BIN_DIR}` : 'Set PG_BIN_DIR to the PostgreSQL bin folder (e.g. C:\\Program Files\\PostgreSQL\\18\\bin)'
  );
  addCheck('backup directory exists', exists('server/database/backups'), 'Database backup location');
  addCheck(
    'OFFSITE_BACKUP_DIR is set and accessible',
    fs.existsSync(resolveOffsiteBackupDir(process.env.OFFSITE_BACKUP_DIR)),
    resolveOffsiteBackupDir(process.env.OFFSITE_BACKUP_DIR)
  );
  addCheck('server dependencies installed', exists('server/node_modules'), 'Run npm.cmd install in server');
  addCheck('client dependencies installed', exists('client/node_modules'), 'Run npm.cmd install in client');
  addCheck('PM2 config exists', exists('ecosystem.config.cjs'), 'Use pm2 start ecosystem.config.cjs');

  let failed = 0;
  for (const check of checks) {
    const status = check.ok ? 'PASS' : 'FAIL';
    console.log(`${status} ${check.name} - ${check.detail}`);
    if (!check.ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`Production check failed: ${failed} issue(s) found.`);
    process.exit(1);
  }

  console.log('Production check passed.');
}

main().catch((err) => {
  console.error('Production check crashed:', err);
  process.exit(1);
});
