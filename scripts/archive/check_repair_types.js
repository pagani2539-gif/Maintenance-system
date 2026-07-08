const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'server', 'database', 'repair_system.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, ticket_no, type FROM repairs LIMIT 20", (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
