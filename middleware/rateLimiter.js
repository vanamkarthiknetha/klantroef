const rateLimit = require('express-rate-limit');

// In-memory store is okay for a single instance. For multi-instance, use a Redis store.
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 min
const max = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);              // 30 req/min/IP

const viewLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => {
    // Per-IP limiting; you could also key by mediaId+IP if desired
    const ip =
      (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown';
    return ip;
  },
});

module.exports = { viewLimiter };
