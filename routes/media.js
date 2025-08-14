const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const getRedis = require('../config/redis');
const { viewLimiter } = require('../middleware/rateLimiter');

const auth = require('../middleware/auth');
const MediaAsset = require('../models/MediaAsset');
const MediaViewLog = require('../models/MediaViewLog');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'media');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  }
});
const upload = multer({ storage });

// POST /media -> upload file + metadata (authenticated)
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    const { title, type } = req.body;
    if (!title || !type || !['video', 'audio'].includes(type)) {
      return res.status(400).json({ error: 'title and type(video|audio) required' });
    }
    if (!req.file) return res.status(400).json({ error: 'file required (multipart form-data)' });

    const fileUrl = `${process.env.BASE_URL || ''}/media-files/${req.file.filename}`;
    const media = await MediaAsset.create({
      title,
      type,
      file_url: fileUrl,
      original_filename: req.file.originalname
    });
    return res.status(201).json({ message: 'Media uploaded', media });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /media/:id/stream-url -> returns secure 10-min link (authenticated)
router.get('/:id/stream-url', auth, async (req, res) => {
  try {
    const media = await MediaAsset.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    const streamToken = jwt.sign(
      { mediaId: media._id, purpose: 'stream' },
      process.env.JWT_SECRET,
      { expiresIn: parseInt(process.env.STREAM_TOKEN_EXPIRES_SEC || '600') } // default 600s = 10min
    );

    const url = `${process.env.BASE_URL || ''}/stream/${media._id.toString()}?token=${streamToken}`;
    return res.json({ stream_url: url, expires_in_seconds: parseInt(process.env.STREAM_TOKEN_EXPIRES_SEC || '600') });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Public streaming endpoint (validates token, streams file, logs view)
router.get('/stream/:id', async (req, res) => {
  // Note: This route is mounted at app level in server.js; kept here to group logic.
  res.status(404).json({ error: 'Not implemented here' });
});

// POST /media/:id/view -> log a view (JWT-protected, rate-limited)
router.post('/:id/view', auth, viewLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid media id' });
    }

    const media = await MediaAsset.findById(id);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const ip =
      (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown';

    const ts = req.body?.timestamp ? new Date(req.body.timestamp) : new Date();
    if (Number.isNaN(ts.getTime())) {
      return res.status(400).json({ error: 'Invalid timestamp format' });
    }

    await MediaViewLog.create({
      media_id: media._id,
      viewed_by_ip: ip,
      timestamp: ts,
    });

    // Invalidate analytics cache for this media
    try {
      const redis = getRedis();
      await redis.del(`media:analytics:${id}`);
    } catch (e) {
      // cache miss or redis down should not break writes
      console.warn('Redis DEL failed (non-fatal):', e.message);
    }

    return res.status(201).json({ message: 'View logged successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// GET /media/:id/analytics -> aggregated analytics (JWT-protected, cached)
router.get('/:id/analytics', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid media id' });
    }

    const media = await MediaAsset.findById(id).select('_id');
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const cacheKey = `media:analytics:${id}`;
    const ttl = parseInt(process.env.ANALYTICS_CACHE_TTL_SEC || '60', 10);

    // Try cache
    try {
      const redis = getRedis();
      await redis.connect().catch(() => {}); // safe connect if not yet connected
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      console.warn('Redis GET failed (non-fatal):', e.message);
    }

    const mediaObjectId = new mongoose.Types.ObjectId(id);

    // views_per_day (UTC)
    const perDay = await MediaViewLog.aggregate([
      { $match: { media_id: mediaObjectId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const views_per_day = perDay.reduce((acc, d) => {
      acc[d._id] = d.count;
      return acc;
    }, {});

    const total_views = await MediaViewLog.countDocuments({ media_id: mediaObjectId });
    const unique_ips = (await MediaViewLog.distinct('viewed_by_ip', { media_id: mediaObjectId })).length;

    const payload = { total_views, unique_ips, views_per_day };

    // Set cache
    try {
      const redis = getRedis();
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', ttl);
      res.set('X-Cache', 'MISS');
    } catch (e) {
      console.warn('Redis SET failed (non-fatal):', e.message);
      res.set('X-Cache', 'SKIP');
    }

    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});



module.exports = router;
