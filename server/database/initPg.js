const { pool } = require('./db');
const { runMigrationsPg } = require('./migrationRunnerPg');
const { scheduleBackups } = require('./backupPg');

console.log('Initializing PostgreSQL database...');

const ready = runMigrationsPg(pool)
  .then(() => {
    if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_BACKUP_SCHEDULER !== '1') {
      scheduleBackups();
    }
  })
  .catch((err) => {
    console.error('CRITICAL: PostgreSQL migration runner failed. Terminating process.', err);
    process.exit(1);
  });

module.exports = { pool, ready };
