const crypto = require('crypto');

const TTL_MS = 24 * 60 * 60 * 1000;
const entries = new Map();

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const fingerprint = (req) => crypto.createHash('sha256')
  .update(`${req.method}|${req.originalUrl}|${stableStringify(req.body || {})}`)
  .digest('hex');

const cleanup = () => {
  const now = Date.now();
  for (const [key, value] of entries) {
    if (value.expiresAt <= now) entries.delete(key);
  }
};

const idempotency = async (req, res, next) => {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!key) return next();
  if (key.length > 200) {
    const error = new Error('Idempotency-Key ยาวเกินไป');
    error.statusCode = 400;
    error.code = 'INVALID_IDEMPOTENCY_KEY';
    return next(error);
  }

  cleanup();
  const actor = req.user?.id || req.user?.username || 'anonymous';
  const storageKey = `${actor}:${req.method}:${req.originalUrl}:${key}`;
  const requestFingerprint = fingerprint(req);
  const existing = entries.get(storageKey);

  if (existing) {
    if (existing.fingerprint !== requestFingerprint) {
      const error = new Error('Idempotency-Key นี้ถูกใช้กับข้อมูลคนละชุด');
      error.statusCode = 409;
      error.code = 'IDEMPOTENCY_KEY_REUSED';
      return next(error);
    }
    if (existing.completed) {
      res.locals.v2SkipWrap = true;
      return res.status(existing.status).json(existing.body);
    }
    try {
      await existing.promise;
      res.locals.v2SkipWrap = true;
      return res.status(existing.status).json(existing.body);
    } catch (error) {
      return next(error);
    }
  }

  let resolvePending;
  let rejectPending;
  const promise = new Promise((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
  });
  entries.set(storageKey, {
    fingerprint: requestFingerprint,
    expiresAt: Date.now() + TTL_MS,
    completed: false,
    promise,
  });

  res.once('finish', () => {
    const current = entries.get(storageKey);
    if (!current) return;
    if (res.statusCode >= 500 || !res.locals.v2Envelope) {
      entries.delete(storageKey);
      rejectPending(new Error('คำขอล้มเหลวและสามารถลองใหม่ได้'));
      return;
    }
    current.completed = true;
    current.status = res.statusCode;
    current.body = res.locals.v2Envelope;
    resolvePending();
  });

  return next();
};

module.exports = { idempotency };
