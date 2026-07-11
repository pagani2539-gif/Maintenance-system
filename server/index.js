require('./utils/loadEnv')();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { pool, ready: dbReady } = require('./database/initPg'); // Connects the pg pool and runs Postgres migrations

const app = express();
const PORT = process.env.PORT || 5221;
const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');
const INTERNAL_ERROR_MESSAGE = 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (Internal Server Error)';
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
  res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  next();
});
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (!isProduction || res.statusCode < 500) return sendJson(body);

    const detail = body && typeof body === 'object' ? (body.error || body.message) : body;
    console.error(`Sanitized ${res.statusCode} response for ${req.method} ${req.originalUrl}:`, detail);
    const sanitized = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
    if ('error' in sanitized) sanitized.error = INTERNAL_ERROR_MESSAGE;
    if ('message' in sanitized) sanitized.message = INTERNAL_ERROR_MESSAGE;
    if (!('error' in sanitized) && !('message' in sanitized)) sanitized.error = INTERNAL_ERROR_MESSAGE;
    return sendJson(sanitized);
  };
  next();
});
app.use(express.json({ limit: '2mb' }));
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

// A minimal readiness endpoint for PM2, reverse proxies, and external monitors.
// It intentionally exposes no database, version, or environment details.
app.get('/api/health', async (_req, res) => {
  try {
    await dbReady;
    await pool.query('SELECT 1');
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ status: 'unavailable' });
  }
});

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
  dbReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to run database migrations, server not started:', err);
      process.exit(1);
    });
}

module.exports = app;
