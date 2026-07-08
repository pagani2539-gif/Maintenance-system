const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'server', 'database', 'repair_system.db');
const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(withdrawals)", (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Columns in withdrawals table:', rows.map(r => r.name).join(', '));
  db.close();
});
