const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'server', 'database', 'repair_system.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // SQLite doesn't directly support ALTER COLUMN to change NOT NULL constraint.
  // The standard workaround is to rename the table, create a new one with correct schema, and copy data.
  
  db.run(`
    CREATE TABLE withdrawals_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER,
      quantity INTEGER,
      serial_number TEXT,
      recipient TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      project_name TEXT,
      type TEXT,
      FOREIGN KEY (inventory_id) REFERENCES inventory (id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating new table:', err.message);
      db.close();
      return;
    }
    
    db.run(`
      INSERT INTO withdrawals_new (id, inventory_id, quantity, serial_number, recipient, note, created_at, project_name, type)
      SELECT id, inventory_id, quantity, serial_number, recipient, note, created_at, project_name, type
      FROM withdrawals
    `, (err) => {
      if (err) {
        console.error('Error copying data:', err.message);
        db.close();
        return;
      }
      
      db.run("DROP TABLE withdrawals", (err) => {
        if (err) {
          console.error('Error dropping old table:', err.message);
          db.close();
          return;
        }
        db.run("ALTER TABLE withdrawals_new RENAME TO withdrawals", (err) => {
          if (err) {
            console.error('Error renaming table:', err.message);
          } else {
            console.log('Successfully updated schema: quantity is now nullable.');
          }
          db.close();
        });
      });
    });
  });
});
