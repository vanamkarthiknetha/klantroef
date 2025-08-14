const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

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

module.exports = router;
