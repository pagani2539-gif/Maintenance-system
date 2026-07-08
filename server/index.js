require('./utils/loadEnv')();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('./database/initPg'); // Connects the pg pool and runs Postgres migrations

const app = express();
const PORT = process.env.PORT || 5221;
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Middleware
if (isProduction && allowedOrigins.length === 0) {
  console.warn('CORS_ORIGIN not set; production API will allow same-origin requests only.');
} else {
  app.use(cors(isProduction ? { origin: allowedOrigins, credentials: true } : undefined));
}
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json());
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    if (!isProduction) {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    }
  }
}));

// Import Routes
const repairRoutes = require('./routes/repairs');
const inventoryRoutes = require('./routes/inventory');
const withdrawalRoutes = require('./routes/withdrawals');
const transactionRoutes = require('./routes/transactions');
const poRoutes = require('./routes/purchaseOrders');
const searchRoutes = require('./routes/search');
const stationRoutes = require('./routes/stations');
const contractRoutes = require('./routes/contracts');
const settingsRoutes = require('./routes/settings');
const stockCountRoutes = require('./routes/stockCounts');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const techniciansRoutes = require('./routes/technicians');
const technicianStockRoutes = require('./routes/technicianStock');
const reportsRoutes = require('./routes/reports');
const errorHandler = require('./middlewares/errorHandler');
const { requireAuth } = require('./middlewares/auth');

// Public auth routes — must be mounted BEFORE the global auth guard
app.use('/api/auth', authRoutes);

// All other API routes require authentication
app.use('/api/repairs', requireAuth, repairRoutes);
app.use('/api/inventory', requireAuth, inventoryRoutes);
app.use('/api/withdrawals', requireAuth, withdrawalRoutes);
app.use('/api/transactions', requireAuth, transactionRoutes);
app.use('/api/purchase-orders', requireAuth, poRoutes);
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/stations', requireAuth, stationRoutes);
app.use('/api/contracts', requireAuth, contractRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/stock-counts', requireAuth, stockCountRoutes);
app.use('/api/users', requireAuth, usersRoutes);
app.use('/api/technicians', requireAuth, techniciansRoutes);
app.use('/api/technician-stock', requireAuth, technicianStockRoutes);
app.use('/api/reports', requireAuth, reportsRoutes);

// Health check endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'Repair System API is running' });
});

// Mount central error handler
app.use(errorHandler);

console.log('Routes mounted on /api/repairs, /api/inventory, /api/withdrawals, /api/purchase-orders');

// Serve static frontend files in production if dist folder exists
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log('Serving production frontend from client/dist');
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Simple check in development/API-only mode
  app.get('/', (req, res) => {
    res.json({ message: 'Repair System API is running (Development Mode)' });
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
