const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { runMigrations } = require('../server/database/migrationRunner');

const dbPath = path.join(__dirname, '..', 'server', 'database', 'repair_system.db');
const db = new sqlite3.Database(dbPath);

console.log('Running manual database migrations check...');
runMigrations(db)
  .then(() => {
    console.log('Migrations execution finished.');
    db.close();
  })
  .catch(err => {
    console.error('Migrations execution failed:', err);
    db.close();
    process.exit(1);
  });
