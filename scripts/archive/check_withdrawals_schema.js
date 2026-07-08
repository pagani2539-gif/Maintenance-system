const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'server', 'database', 'repair_system.db');
const db = new sqlite3.Database(dbPath);

db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='withdrawals'", (err, row) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('CREATE TABLE statement:', row.sql);
  db.close();
});
