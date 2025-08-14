const Redis = require('ioredis');

let redis;
function getRedis() {
  if (!redis) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.on('error', (e) => console.error('Redis error:', e.message));
  }
  return redis;
}

module.exports = getRedis;
