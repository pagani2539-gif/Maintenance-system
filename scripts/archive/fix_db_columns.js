const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'server', 'database', 'repair_system.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Add 'type' column if missing
  db.run("ALTER TABLE withdrawals ADD COLUMN type TEXT", (err) => {
    if (err && err.message.includes('duplicate column name')) {
      console.log('Column "type" already exists.');
    } else if (err) {
      console.error('Error adding "type" column:', err.message);
    } else {
      console.log('Column "type" added successfully.');
    }
  });

  // Add 'project_name' column if missing
  db.run("ALTER TABLE withdrawals ADD COLUMN project_name TEXT", (err) => {
    if (err && err.message.includes('duplicate column name')) {
      console.log('Column "project_name" already exists.');
    } else if (err) {
      console.error('Error adding "project_name" column:', err.message);
    } else {
      console.log('Column "project_name" added successfully.');
    }
  });
});
db.close();
