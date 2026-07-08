const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/database/repair_system.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('--- Data Verification ---');
  
  db.get('SELECT COUNT(*) as count, MIN(created_at) as min_date, MAX(created_at) as max_date FROM withdrawals', (err, row) => {
    console.log('Withdrawals Stats:', row);
  });

  db.all('SELECT project_name, COUNT(*) as count FROM withdrawals GROUP BY project_name LIMIT 5', (err, rows) => {
    console.log('Withdrawals by Project (Sample):', rows);
  });

  db.all('SELECT location, COUNT(*) as count FROM withdrawals GROUP BY location LIMIT 5', (err, rows) => {
    console.log('Withdrawals by Location (Sample):', rows);
  });

  db.get('SELECT COUNT(*) as count, MIN(created_at) as min_date, MAX(created_at) as max_date FROM inventory_transactions', (err, row) => {
    console.log('Transactions Stats:', row);
  });

  db.all('SELECT transaction_type, COUNT(*) as count FROM inventory_transactions GROUP BY transaction_type', (err, rows) => {
    console.log('Transactions by Type:', rows);
    db.close();
  });
});
