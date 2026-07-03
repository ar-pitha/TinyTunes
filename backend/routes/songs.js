const express = require('express');
const router = express.Router();
const Song = require('../models/songschema');
const authenticateToken = require('../middleware/auth');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_AUDIO_DIR = path.resolve(__dirname, '../../uploads/audio');
if (!fs.existsSync(UPLOAD_AUDIO_DIR)) {
  fs.mkdirSync(UPLOAD_AUDIO_DIR, { recursive: true });
}
const decodePromises = new Map();

// --------------- LRU Buffer Cache ---------------
// Avoids re-decoding base64 from MongoDB on every range request.
// Keeps up to ~200 MB of decoded audio in memory (auto-evicts oldest).
const CACHE_MAX = 200 * 1024 * 1024; // 200 MB
const bufferCache = new Map();       // songId -> { buffer, contentType, size, lastUsed }
let cacheCurrentSize = 0;

function cacheGet(songId) {
  const entry = bufferCache.get(songId);
  if (entry) { entry.lastUsed = Date.now(); }
  return entry || null;
}

function cachePut(songId, buffer, contentType) {
  // evict oldest entries until we have room
  while (cacheCurrentSize + buffer.length > CACHE_MAX && bufferCache.size > 0) {
    let oldestKey = null, oldestTime = Infinity;
    for (const [k, v] of bufferCache) {
      if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
    }
    if (oldestKey) {
      cacheCurrentSize -= bufferCache.get(oldestKey).size;
      bufferCache.delete(oldestKey);
    }
  }
  bufferCache.set(songId, { buffer, contentType, size: buffer.length, lastUsed: Date.now() });
  cacheCurrentSize += buffer.length;
}
// ------------------------------------------------

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('File filter - MIME type:', file.mimetype);
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// Upload song route with base64 storage
router.post('/upload', authenticateToken, (req, res) => {
  console.log('Upload request received');
  
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Upload middleware error:', err);
      
      if (err instanceof multer.MulterError) {
        switch (err.code) {
          case 'LIMIT_FILE_SIZE':
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
          case 'LIMIT_FILE_COUNT':
            return res.status(400).json({ error: 'Too many files.' });
          case 'LIMIT_UNEXPECTED_FILE':
            return res.status(400).json({ error: 'Unexpected file field.' });
          default:
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
      }
      
      return res.status(400).json({ error: err.message });
    }

    try {
      console.log('File upload successful:', req.file ? 'Yes' : 'No');
      
      if (!req.file || !req.file.buffer) {
        return res.status(500).json({ error: 'File upload failed. Please try again.' });
      }

      console.log('Uploaded file info:', {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // Extract song metadata from request body
      const { title, artist, album, duration, folder, bitrate, format, albumArt } = req.body;

      console.log('Song metadata:', { title, artist, album, duration });

      // Basic validation
      if (!title || !artist || !album || !duration) {
        return res.status(400).json({ 
          error: 'Missing required song information (title, artist, album, duration)' 
        });
      }

      // Convert file buffer to base64
      const fileBase64 = req.file.buffer.toString('base64');

      // Create the song document with embedded file data
      const songData = {
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        duration: parseInt(duration),
        originalName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.user.id,
        folder: folder ? folder.trim() : 'default',
        // Store file data and metadata
        fileData: {
          data: fileBase64,
          contentType: req.file.mimetype
        },
        metadata: {
          bitrate: bitrate || '',
          format: format || path.extname(req.file.originalname).substring(1),
          albumArt: albumArt || ''
        }
      };

      console.log('Creating song document with file size:', req.file.size);

      const song = new Song(songData);
      await song.save();

      const fileExt = path.extname(req.file.originalname) || '';
      const diskPath = path.join(UPLOAD_AUDIO_DIR, `${song._id}${fileExt}`);
      try {
        fs.writeFileSync(diskPath, req.file.buffer);
        song.filePath = diskPath;
        await song.save();
        console.log('Persisted uploaded audio to disk:', diskPath);
      } catch (diskErr) {
        console.warn('Failed to persist uploaded audio to disk:', diskErr);
      }

      console.log('Song saved successfully:', song._id);

      res.status(201).json({ 
        message: 'Song uploaded successfully', 
        song: {
          _id: song._id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          duration: song.duration,
          folder: song.folder,
          fileSize: song.fileSize,
          uploadedAt: song.uploadedAt
        }
      });

    } catch (error) {
      console.error('Song creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    dbConnection: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    storageType: 'base64_embedded'
  });
});

// Get all songs uploaded by current user (without file data)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const songs = await Song.find({ uploadedBy: req.user.id })
      .select('-fileData') // Exclude file data from list
      .sort({ uploadedAt: -1 });
    
    res.json(songs);
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get details of a single song by ID (without file data)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findById(id).select('-fileData');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check ownership
    if (song.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(song);

  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream song file
router.get('/:id/stream', async (req, res) => {
  const songId = req.params?.id;
  const timerLabel = `streamSong-${songId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  console.time(timerLabel);
  const range = req.headers.range;
  console.log('Stream request received', { songId, range: range || 'none' });

  if (!songId) {
    console.timeEnd(timerLabel);
    return res.status(400).json({ error: 'Missing song id in request params' });
  }

  if (!mongoose.Types.ObjectId.isValid(songId)) {
    console.timeEnd(timerLabel);
    return res.status(400).json({ error: 'Invalid Song ID' });
  }

  const getContentType = (song, filePath) => {
    const formatMap = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      flac: 'audio/flac',
      ogg: 'audio/ogg',
      webm: 'audio/webm'
    };

    if (song.fileData?.contentType) return song.fileData.contentType;
    const ext = filePath ? path.extname(filePath).substring(1).toLowerCase() : '';
    if (ext && formatMap[ext]) return formatMap[ext];

    const format = (song.metadata?.format || '').toLowerCase().trim();
    if (format && formatMap[format]) return formatMap[format];

    if (song.originalName) {
      const nameExt = path.extname(song.originalName).substring(1).toLowerCase();
      if (nameExt && formatMap[nameExt]) return formatMap[nameExt];
    }

    return 'audio/mpeg';
  };

  const parseRange = (rangeHeader, total) => {
    if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= total) return null;
    return { start, end: Math.min(end, total - 1) };
  };

  const inferDiskPath = (song) => {
    const ext = path.extname(song.originalName || '').toLowerCase() || '.mp3';
    return path.join(UPLOAD_AUDIO_DIR, `${songId}${ext}`);
  };

  const findExistingDiskPath = (song) => {
    const candidates = [];

    if (song.filePath) {
      candidates.push(song.filePath);
    }

    const inferred = inferDiskPath(song);
    if (inferred) {
      candidates.push(inferred);
    }

    if (song.originalName) {
      const baseName = path.basename(song.originalName, path.extname(song.originalName));
      candidates.push(path.join(UPLOAD_AUDIO_DIR, `${baseName}`));
      candidates.push(path.join(UPLOAD_AUDIO_DIR, `${songId}`));
      candidates.push(path.join(UPLOAD_AUDIO_DIR, `${songId}-${baseName}`));
    }

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const dirEntries = fs.existsSync(UPLOAD_AUDIO_DIR) ? fs.readdirSync(UPLOAD_AUDIO_DIR) : [];
    const matching = dirEntries.filter((name) => name.startsWith(`${songId}`) || name.includes(songId));
    if (matching.length > 0) {
      const exact = matching.find((name) => fs.existsSync(path.join(UPLOAD_AUDIO_DIR, name)) && fs.statSync(path.join(UPLOAD_AUDIO_DIR, name)).isFile());
      if (exact) {
        return path.join(UPLOAD_AUDIO_DIR, exact);
      }
    }

    return null;
  };

  const streamFromDisk = (filePath, contentType, rangeInfo) => {
    const stat = fs.statSync(filePath);
    const total = stat.size;
    const stream = rangeInfo
      ? fs.createReadStream(filePath, { start: rangeInfo.start, end: rangeInfo.end })
      : fs.createReadStream(filePath);

    stream.on('error', (err) => {
      console.error('Disk stream error:', err, { songId, filePath });
      if (!res.headersSent) {
        res.status(500).end('Stream error');
      } else {
        stream.destroy(err);
      }
    });

    res.on('close', () => stream.destroy());
    res.on('finish', () => console.timeEnd(timerLabel));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    res.setHeader('ETag', `"${songId}"`);

    if (rangeInfo) {
      res.writeHead(206, {
        'Content-Range': `bytes ${rangeInfo.start}-${rangeInfo.end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': rangeInfo.end - rangeInfo.start + 1,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable'
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, immutable'
    });
    stream.pipe(res);
  };


  try {
    console.timeLog(timerLabel, 'db load start');
    const song = await Song.findById(songId)
      .select('filePath fileData.contentType metadata.format originalName')
      .lean();
    console.timeLog(timerLabel, 'db load end', { found: !!song, filePath: !!song?.filePath });

    if (!song) {
      console.timeEnd(timerLabel);
      return res.status(404).json({ error: 'Song not found' });
    }

    const contentType = getContentType(song, song.filePath);
    const effectivePath = findExistingDiskPath(song);

    if (effectivePath) {
      if (!song.filePath) {
        try {
          await Song.updateOne({ _id: songId }, { filePath: effectivePath });
          console.timeLog(timerLabel, 'recovered missing filePath from disk', { filePath: effectivePath });
        } catch (updateErr) {
          console.warn('Failed to persist recovered filePath', updateErr);
        }
      }

      const stat = fs.statSync(effectivePath);
      const rangeInfo = range ? parseRange(range, stat.size) : null;
      if (range && !rangeInfo) {
        console.timeEnd(timerLabel);
        return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
      }
      console.timeLog(timerLabel, 'stream from disk', { filePath: effectivePath, range: range || 'none' });
      streamFromDisk(effectivePath, contentType, rangeInfo);
      return;
    }

    console.timeLog(timerLabel, 'legacy load required');
    const legacySong = await Song.findById(songId)
      .select('fileData.data fileData.contentType metadata.format originalName')
      .lean();

    if (!legacySong || !legacySong.fileData?.data) {
      console.error('Stream error: no filePath and no embedded audio data', songId);
      console.timeEnd(timerLabel);
      return res.status(404).json({ error: 'Audio file not available for this song' });
    }

    const legacyContentType = getContentType(legacySong, null);
    const pending = decodePromises.get(songId);
    if (pending) {
      console.timeLog(timerLabel, 'awaiting existing legacy decode');
      await pending;
      const recoveredPath = findExistingDiskPath(legacySong);
      if (recoveredPath && fs.existsSync(recoveredPath)) {
        const stat = fs.statSync(recoveredPath);
        const rangeInfo = range ? parseRange(range, stat.size) : null;
        if (range && !rangeInfo) {
          console.timeEnd(timerLabel);
          return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
        }
        console.timeLog(timerLabel, 'stream from disk after legacy backfill', { filePath: recoveredPath, range: range || 'none' });
        streamFromDisk(recoveredPath, legacyContentType, rangeInfo);
        return;
      }
      console.timeEnd(timerLabel);
      return res.status(500).json({ error: 'Audio stream not ready yet' });
    }

    const requestPromise = (async () => {
      const fallbackPath = inferDiskPath(legacySong);
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
      console.timeLog(timerLabel, 'base64 decode start');
      const fileBuffer = Buffer.from(legacySong.fileData.data, 'base64');
      console.timeLog(timerLabel, 'base64 decode end', { decodedBytes: fileBuffer.length });
      try {
        fs.writeFileSync(fallbackPath, fileBuffer);
        try {
          await Song.updateOne({ _id: songId }, { filePath: fallbackPath });
          console.timeLog(timerLabel, 'persisted fallback disk copy', { filePath: fallbackPath });
        } catch (updateErr) {
          console.warn('Failed to persist fallback filePath', updateErr);
        }
      } catch (writeErr) {
        console.warn('Failed to write fallback disk copy', writeErr);
      }
      cachePut(songId, fileBuffer, legacyContentType);
      console.timeLog(timerLabel, 'buffer cached');
      serveBuffer(req, res, fileBuffer, legacyContentType, songId, timerLabel);
    })();

    decodePromises.set(songId, requestPromise);
    try {
      await requestPromise;
    } finally {
      decodePromises.delete(songId);
      console.timeEnd(timerLabel);
    }
  } catch (err) {
    console.error('Stream error:', err, { songId });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error while streaming audio' });
    } else {
      res.destroy(err);
    }
    console.timeEnd(timerLabel);
  }
});

// Shared helper: serve a Buffer with Range support + caching headers
function serveBuffer(req, res, fileBuffer, contentType, songId, timerLabel) {
  const total = fileBuffer.length;
  const range = req.headers.range;

  if (timerLabel) console.timeLog(timerLabel, 'serveBuffer', { totalBytes: total, range: range || 'none' });
  if (timerLabel && range) console.timeLog(timerLabel, 'range request', { range });

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Accept-Ranges', 'bytes');
  // Allow browser to cache audio for 1 day (audio files are immutable)
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('ETag', `"${songId}"`);

  // Handle conditional request (304 Not Modified)
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === `"${songId}"`) {
    return res.status(304).end();
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

    if (isNaN(start) || isNaN(end) || start > end || start >= total) {
      res.set('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }

    const chunk = fileBuffer.slice(start, end + 1);
    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunk.length,
      'Content-Type': contentType
    });
    return res.end(chunk);
  } else {
    res.status(200).set({
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    return res.end(fileBuffer);
  }
}

// Delete a song by ID
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    if (song.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this song' });
    }

    // Delete song document (file data is embedded, so it's deleted too)
    await Song.deleteOne({ _id: id });
    console.log('Song document and file data deleted');

    res.json({ message: 'Song deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Increment play count
router.post('/:id/play', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findByIdAndUpdate(
      id,
      { $inc: { playCount: 1 } },
      { new: true, select: '-fileData' }
    );

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json({ 
      message: "Play count incremented", 
      playCount: song.playCount 
    });

  } catch (error) {
    console.error('Play count error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get song file size and info (useful for debugging)
router.get('/:id/info', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Song ID' });
    }

    const song = await Song.findById(id).select('title artist fileSize fileData.contentType originalName uploadedBy');
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Check ownership
    if (song.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      title: song.title,
      artist: song.artist,
      originalName: song.originalName,
      fileSize: song.fileSize,
      contentType: song.fileData?.contentType,
      hasFileData: !!song.fileData?.data
    });

  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;