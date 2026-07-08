const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");
  
  // Clear station_areas first due to foreign key constraints, or rely on cascade
  db.run("DELETE FROM station_areas", [], function(err) {
    if (err) {
      console.error("Error clearing station_areas:", err);
    } else {
      console.log(`Cleared station_areas. Rows deleted: ${this.changes}`);
    }
  });

  db.run("DELETE FROM stations", [], function(err) {
    if (err) {
      console.error("Error clearing stations:", err);
    } else {
      console.log(`Cleared stations. Rows deleted: ${this.changes}`);
    }
  });
});
