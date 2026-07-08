const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const uploadsDir = path.join(__dirname, '../server/uploads');

const db = new sqlite3.Database(dbPath);

const tables = [
  'repair_logs',
  'repair_images',
  'device_changes',
  'repairs',
  'inventory_transactions',
  'inventory_instances',
  'withdrawal_items',
  'withdrawals',
  'purchase_order_items',
  'purchase_orders',
  'inventory',
  'station_areas',
  'stations',
  'audit_logs'
];

db.serialize(() => {
  console.log('--- Starting Data Clearing Process ---');
  
  // 1. Disable Foreign Keys temporarily
  db.run('PRAGMA foreign_keys = OFF;');
  console.log('Foreign keys disabled.');

  // 2. Clear all tables
  for (const table of tables) {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) {
        console.error(`Error clearing table ${table}:`, err.message);
      } else {
        console.log(`Cleared table: ${table}`);
      }
    });
    
    // Reset auto-increment
    db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
  }

  // 3. Re-enable Foreign Keys
  db.run('PRAGMA foreign_keys = ON;');
  console.log('Foreign keys re-enabled.');

  // 4. Clear uploads folder
  if (fs.existsSync(uploadsDir)) {
    console.log('Clearing uploads directory...');
    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;
    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(uploadsDir, file);
      try {
        if (fs.lstatSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        console.error(`Error deleting file ${file}:`, err.message);
      }
    }
    console.log(`Deleted ${deletedCount} files from uploads.`);
  }

  console.log('--- Data Clearing Completed Successfully ---');
});

db.close();
