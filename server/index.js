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
const isPublicApiMode = process.env.NODE_ENV !== 'test'
  && /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_API_MODE || '').trim());
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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
if (isPublicApiMode) {
  // Public API mode intentionally supports browser calls from any origin.
  // Credentials must remain disabled when using the wildcard origin.
  app.use(cors({ origin: '*', credentials: false }));
  console.warn('PUBLIC_API_MODE enabled; all API routes accept unauthenticated cross-origin requests.');
} else if (isProduction && allowedOrigins.length === 0) {
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

// Compatibility for logos uploaded through the old v2 middleware. Their DB
// path is `logos/<filename>`, but the file was previously written one level
// too high. Serve those existing files without mutating production data.
app.get('/uploads/logos/:filename', (req, res, next) => {
  const filename = path.basename(req.params.filename);
  const legacyPath = path.join(uploadDir, filename);
  if (!fs.existsSync(legacyPath)) return next();
  return res.sendFile(legacyPath);
});

// Import the versioned API only. Controllers remain shared internally by v2.
const v2Routes = require('./routes/v2');
const { requestId } = require('./middlewares/apiV2');
const openApiV2 = require('./openapi/v2');
const errorHandler = require('./middlewares/errorHandler');

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

// API v2 uses a versioned URL, camelCase DTOs, shared validation and a stable
// response/error envelope.
app.use('/api/v2', requestId, v2Routes);

// Health check endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'Repair System API is running' });
});

// Serve API documentation at /api-docs
app.get('/api-docs', (req, res) => {
  const docsPath = path.join(__dirname, '../API_V2.md');
  if (!fs.existsSync(docsPath)) {
    return res.status(404).json({ error: 'API documentation not found' });
  }

  res.set({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.send(fs.readFileSync(docsPath, 'utf8'));
});

app.get('/api-docs/v2', (_req, res) => {
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.json(openApiV2);
});

// Resource endpoints outside /api/v2 are intentionally removed. Keep this
// before the production SPA fallback so a stale client receives a real 404.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  return requestId(req, res, () => res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'ไม่พบ endpoint ที่ร้องขอ',
      details: [],
      requestId: req.requestId,
    },
  }));
});

// Mount central error handler
app.use(errorHandler);

console.log('Routes mounted on /api/v2');

// Serve static frontend files in production if dist folder exists
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      const fileName = path.basename(filePath);
      const relativePath = path.relative(distPath, filePath);
      const isHashedAsset = relativePath.startsWith(`assets${path.sep}`)
        && /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(fileName);

      // Hashed assets are content-addressed and safe to cache forever. HTML,
      // service workers, manifests and icons must never be stored: allowing
      // browser revalidation here can keep an old app shell alive when Chrome
      // still owns a stale ETag or legacy service-worker cache.
      if (isHashedAsset) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.set({
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0'
        });
      }
    }
  }));
  console.log('Serving production frontend from client/dist');
  // Do not serve index.html for a missing JavaScript/CSS asset. Returning HTML
  // here turns a stale lazy import into a misleading MIME-type failure.
  app.get('/assets/*', (_req, res) => {
    res.status(404).type('text/plain').send('Asset not found');
  });
  app.get('*', (req, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
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
