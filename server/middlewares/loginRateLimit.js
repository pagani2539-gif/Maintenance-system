const crypto = require('crypto');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_FAILURES = 5;
const MAX_IP_FAILURES = 20;
const attempts = new Map();

const now = () => Date.now();

const pruneExpired = () => {
  const current = now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= current) attempts.delete(key);
  }
};

const recordFailure = (key) => {
  const current = now();
  const existing = attempts.get(key);
  const entry = existing && existing.resetAt > current
    ? { ...existing, failures: existing.failures + 1 }
    : { failures: 1, resetAt: current + WINDOW_MS };
  attempts.set(key, entry);
  return entry;
};

const retryAfter = (entry) => Math.max(1, Math.ceil((entry.resetAt - now()) / 1000));

const loginRateLimit = (req, res, next) => {
  pruneExpired();

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').trim().toLowerCase().slice(0, 128);
  const usernameHash = crypto.createHash('sha256').update(username).digest('hex');
  const ipKey = `ip:${ip}`;
  const accountKey = `account:${ip}:${usernameHash}`;
  const ipAttempt = attempts.get(ipKey);
  const accountAttempt = attempts.get(accountKey);
  const blocked = [
    ipAttempt?.failures >= MAX_IP_FAILURES ? ipAttempt : null,
    accountAttempt?.failures >= MAX_ACCOUNT_FAILURES ? accountAttempt : null,
  ].filter(Boolean);

  if (blocked.length > 0) {
    const waitSeconds = Math.max(...blocked.map(retryAfter));
    console.warn(`Login rate limit blocked request from ${ip} for username hash ${usernameHash.slice(0, 12)}`);
    res.set('Retry-After', String(waitSeconds));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  res.once('finish', () => {
    if (res.statusCode === 401) {
      const accountEntry = recordFailure(accountKey);
      const ipEntry = recordFailure(ipKey);
      if (accountEntry.failures === MAX_ACCOUNT_FAILURES || ipEntry.failures === MAX_IP_FAILURES) {
        console.warn(`Login rate limit threshold reached from ${ip} for username hash ${usernameHash.slice(0, 12)}`);
      }
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      attempts.delete(accountKey);
    }
  });

  return next();
};

module.exports = { loginRateLimit };
