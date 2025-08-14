require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const mediaRoutes = require('./routes/media');

const MediaAsset = require('./models/MediaAsset');
const MediaViewLog = require('./models/MediaViewLog');

const app = express();
const PORT = process.env.PORT || 4000;

connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/media_platform');

app.use(morgan('dev'));
app.use(express.json());

// static serving of media files
const mediaStatic = path.join(__dirname, 'uploads', 'media');
if (!fs.existsSync(mediaStatic)) fs.mkdirSync(mediaStatic, { recursive: true });

app.use('/media-files', express.static(mediaStatic));    // public file roots (but streaming required token)

// routes
app.use('/auth', authRoutes);
app.use('/media', mediaRoutes);

// streaming endpoint (validates token, streams file, logs view)
// Example: GET /stream/:id?token=...
app.get('/stream/:id', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'stream') return res.status(401).json({ error: 'Invalid token purpose' });
    if (payload.mediaId !== req.params.id && payload.mediaId !== req.params.id.toString()) {
      return res.status(401).json({ error: 'Token media mismatch' });
    }

    const media = await MediaAsset.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Log the view
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || 'unknown';
    await MediaViewLog.create({ media_id: media._id, viewed_by_ip: ip });

    // Stream the file by redirecting to static URL or piping file
    // For simple setups, redirect to the static file path (note: this exposes file URL — maintain host protections if needed).
    // We'll stream the local file to keep token control.
    const filePath = path.join(__dirname, 'uploads', 'media', path.basename(media.file_url));

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing on server' });
    }

    // Support range requests for video streaming
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize || end >= fileSize) {
        res.status(416).header('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = (end - start) + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': media.type === 'video' ? 'video/mp4' : 'audio/mpeg'
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': media.type === 'video' ? 'video/mp4' : 'audio/mpeg'
      });
      fs.createReadStream(filePath).pipe(res);
    }

  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
