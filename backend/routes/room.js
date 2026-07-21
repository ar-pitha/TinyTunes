const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Room = require('../models/roomschema'); // Adjust path as needed
const User = require('../models/userschema'); // For user validation
const Song = require('../models/songschema'); // For song validation
const authenticateToken = require('../middleware/auth'); // Your JWT middleware
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { code, name, isPrivate, password, theme } = req.body;
    const normalizedCode = String(code || '').trim().toUpperCase();

    // Check that the room code is unique
    const existingRoom = await Room.findOne({ code: normalizedCode });
    if (existingRoom) {
      return res.status(409).json({ error: 'Room code already exists' });
    }

    // Create new room with host as current user and user added to users array
    const newRoom = new Room({
      code: normalizedCode,
      name: name || '',
      host: req.user.id,
      isPrivate: isPrivate || false,
      password: password || null,
      currentSong: null,
      currentTime: 0,
      isPlaying: false,
      queue: [],
      users: [req.user.id],
      theme: theme || 'default'
    });

    await newRoom.save();

    res.status(201).json(newRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();

    const room = await Room.findOne({ code: normalizedCode })
      .populate('host', 'username email')
      .populate('users', 'username email');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    // If room is private, optional: require password, add logic here if needed

    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/:code/join', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { password } = req.body; // Password for private rooms (optional)

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // If private, verify password
    if (room.isPrivate) {
      if (!password || password !== room.password) {
        return res.status(401).json({ error: 'Invalid or missing room password' });
      }
    }

    // Check if user already joined
    if (room.users.some(id => id.toString() === userId.toString())) {
      return res.status(400).json({ error: 'User already in the room' });
    }

    // Add user to room
    room.users.push(userId);
    await room.save();

    // Populate the users info for response
    await room.populate('users', 'username email');

    res.json({ message: 'Joined room successfully', users: room.users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/:code/leave', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(400).json({ error: 'User not in the room' });
    }

    // Remove user from users array
    room.users = room.users.filter(id => id.toString() !== userId.toString());

    // If the user is the host, assign new host if users remain
    if (room.host.toString() === userId) {
      if (room.users.length > 0) {
        room.host = room.users[0];
      } else {
        // No users left, delete room
        await room.deleteOne();
        return res.json({ message: 'Room deleted because no users remain' });
      }
    }

    await room.save();

    await room.populate('users', 'username email');

    res.json({ message: 'Left room successfully', users: room.users, host: room.host });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.put('/:code/playback', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { currentSong: currentSongPayload, currentTime, isPlaying, queue, serverTime } = req.body;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can update playback' });
    }

    // Save current song
    if (currentSongPayload && typeof currentSongPayload === 'object') {
      room.currentSong = {
        _id: currentSongPayload._id || currentSongPayload.id || null,
        id: currentSongPayload.id || currentSongPayload._id || null,
        songId: currentSongPayload.songId || currentSongPayload._id || currentSongPayload.id || null,
        title: currentSongPayload.title || 'Unknown',
        artist: currentSongPayload.artist || '',
        album: currentSongPayload.album || '',
        duration: currentSongPayload.duration || 0,
        source: currentSongPayload.source || 'uploaded',
      };
    } else {
      room.currentSong = null;
    }

    if (typeof currentTime === 'number') room.currentTime = Math.max(0, currentTime);
    if (typeof isPlaying === 'boolean') room.isPlaying = isPlaying;

    // Save queue (array of song objects)
    if (Array.isArray(queue)) {
      room.queue = queue.filter(Boolean).map((entry) => {
        if (typeof entry === 'string') return { songId: entry };
        if (typeof entry === 'object' && entry) {
          return {
            songId: entry.songId || entry._id || entry.id || '',
            title: entry.title || 'Unknown',
            artist: entry.artist || '',
            album: entry.album || '',
            duration: entry.duration || 0,
            source: entry.source || 'Uploaded',
          };
        }
        return null;
      }).filter(Boolean);
    }

    room.syncTimestamp = serverTime || Date.now();
    room.lastSyncAt = new Date();

    await room.save();

    res.json({
      _id: room._id,
      code: room.code,
      name: room.name,
      host: room.host,
      isPrivate: room.isPrivate,
      currentSong: room.currentSong,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      queue: room.queue,
      users: room.users,
      createdAt: room.createdAt,
      theme: room.theme,
      syncTimestamp: room.syncTimestamp,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('Playback persist error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Update room details (name, theme, etc.)
router.put('/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { name, theme } = req.body;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can update room details
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can update room details' });
    }

    if (typeof name === 'string') room.name = name;
    if (typeof theme === 'string') room.theme = theme;

    await room.save();

    const updatedRoom = await Room.findById(room._id)
      .populate('host', 'username email')
      .populate('users', 'username email');

    res.json(updatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a user from the room
router.delete('/:code/users', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { userId: userIdToRemove } = req.body;

    if (!userIdToRemove) {
      return res.status(400).json({ error: 'userId required in request body' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can remove users
    if (room.host.toString() !== userId) {
      return res.status(403).json({ error: 'Only host can remove users' });
    }

    // Cannot remove yourself
    if (userIdToRemove === userId) {
      return res.status(400).json({ error: 'Cannot remove yourself, use leave endpoint' });
    }

    if (!room.users.some(id => id.toString() === userIdToRemove)) {
      return res.status(400).json({ error: 'User not in the room' });
    }

    room.users = room.users.filter(id => id.toString() !== userIdToRemove);
    await room.save();

    await room.populate('users', 'username email');

    res.json({ message: 'User removed from the room', users: room.users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete room (only host)
router.delete('/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can delete the room
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can delete the room' });
    }

    await room.deleteOne();

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ QUEUE ENDPOINTS ============

// Add song to queue
router.post('/:code/queue/add', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { songId, title, artist, album, duration, source } = req.body;

    if (!songId || !title || !artist) {
      return res.status(400).json({ error: 'songId, title, and artist are required' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    const newQueueItem = {
      _id: new mongoose.Types.ObjectId(),
      songId,
      title,
      artist,
      album: album || '',
      duration: duration || 0,
      source: source || 'Uploaded',
      addedBy: userId,
      addedAt: new Date(),
      order: room.queue.length
    };

    room.queue.push(newQueueItem);
    room.updatedAt = new Date();
    await room.save();

    // Emit queue update to all sockets in the room (if Socket.IO instance is available)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(normalizedCode).emit('queueUpdated', { roomCode: normalizedCode, queue: room.queue });
      }
    } catch (e) {
      console.error('Failed to emit queueUpdated:', e.message);
    }

    res.status(201).json({ message: 'Song added to queue', queueItem: newQueueItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove song from queue
router.delete('/:code/queue/:itemId', authenticateToken, async (req, res) => {
  try {
    const { code, itemId } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    // Only host or the user who added it can remove
    const queueItem = room.queue.find(item => item._id.toString() === itemId);
    if (!queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    if (room.host.toString() !== userId.toString() && queueItem.addedBy.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host or the user who added the song can remove it' });
    }

    room.queue = room.queue.filter(item => item._id.toString() !== itemId);
    room.updatedAt = new Date();
    await room.save();

    // Emit queue update to all sockets in the room
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(normalizedCode).emit('queueUpdated', { roomCode: normalizedCode, queue: room.queue });
      }
    } catch (e) {
      console.error('Failed to emit queueUpdated:', e.message);
    }

    res.json({ message: 'Song removed from queue' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reorder queue
router.put('/:code/queue/reorder', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { newOrder } = req.body;

    if (!Array.isArray(newOrder)) {
      return res.status(400).json({ error: 'newOrder must be an array of item IDs' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can reorder queue
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can reorder queue' });
    }

    // Validate all IDs exist
    for (let id of newOrder) {
      if (!room.queue.some(item => item._id.toString() === id)) {
        return res.status(400).json({ error: `Queue item not found: ${id}` });
      }
    }

    // Reorder based on newOrder array
    const reorderedQueue = newOrder.map((id, index) => {
      const item = room.queue.find(item => item._id.toString() === id);
      item.order = index;
      return item;
    });

    room.queue = reorderedQueue;
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Queue reordered successfully', queue: room.queue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get queue
router.get('/:code/queue', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode })
      .populate('queue.addedBy', 'username');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    res.json({ queue: room.queue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear queue
router.delete('/:code/queue', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can clear queue
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can clear queue' });
    }

    room.queue = [];
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Queue cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PLAYLIST ENDPOINTS ============

// Add song to playlist
router.post('/:code/playlist/add', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { songId, title, artist, album, duration, source } = req.body;

    if (!songId || !title || !artist) {
      return res.status(400).json({ error: 'songId, title, and artist are required' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    const newPlaylistItem = {
      _id: new mongoose.Types.ObjectId(),
      songId,
      title,
      artist,
      album: album || '',
      duration: duration || 0,
      source: source || 'Uploaded',
      addedBy: userId,
      addedAt: new Date(),
      order: room.playlist.length
    };

    room.playlist.push(newPlaylistItem);
    room.updatedAt = new Date();
    await room.save();

    res.status(201).json({ message: 'Song added to playlist', playlistItem: newPlaylistItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove song from playlist
router.delete('/:code/playlist/:itemId', authenticateToken, async (req, res) => {
  try {
    const { code, itemId } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    // Only host can remove from playlist
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can remove from playlist' });
    }

    const playlistItem = room.playlist.find(item => item._id.toString() === itemId);
    if (!playlistItem) {
      return res.status(404).json({ error: 'Playlist item not found' });
    }

    room.playlist = room.playlist.filter(item => item._id.toString() !== itemId);
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Song removed from playlist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reorder playlist
router.put('/:code/playlist/reorder', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { newOrder } = req.body;

    if (!Array.isArray(newOrder)) {
      return res.status(400).json({ error: 'newOrder must be an array of item IDs' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can reorder playlist
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can reorder playlist' });
    }

    // Validate all IDs exist
    for (let id of newOrder) {
      if (!room.playlist.some(item => item._id.toString() === id)) {
        return res.status(400).json({ error: `Playlist item not found: ${id}` });
      }
    }

    // Reorder based on newOrder array
    const reorderedPlaylist = newOrder.map((id, index) => {
      const item = room.playlist.find(item => item._id.toString() === id);
      item.order = index;
      return item;
    });

    room.playlist = reorderedPlaylist;
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Playlist reordered successfully', playlist: room.playlist });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get playlist
router.get('/:code/playlist', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode })
      .populate('playlist.addedBy', 'username');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    res.json({ playlist: room.playlist });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search playlist
router.get('/:code/playlist/search', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const { query } = req.query;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const room = await Room.findOne({ code: normalizedCode })
      .populate('playlist.addedBy', 'username');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    const lowerQuery = query.toLowerCase();
    const results = room.playlist.filter(item =>
      item.title.toLowerCase().includes(lowerQuery) ||
      item.artist.toLowerCase().includes(lowerQuery)
    );

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PLAYBACK CONTROL ENDPOINTS ============

// Play song from queue or playlist
router.post('/:code/playback/play', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { songId, source, index } = req.body;

    if (!songId || !source) {
      return res.status(400).json({ error: 'songId and source (Queue or Playlist) are required' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can control playback
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can control playback' });
    }

    // Update playback state
    room.playback.currentSongId = songId;
    room.playback.currentSource = source;
    room.playback.currentQueueIndex = source === 'Queue' ? (index || 0) : -1;
    room.playback.currentPlaylistIndex = source === 'Playlist' ? (index || 0) : -1;
    room.playback.currentTime = 0;
    room.playback.isPlaying = true;
    room.playback.lastUpdated = new Date();
    room.playback.syncTimestamp = Date.now();

    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Playback started', playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pause playback
router.post('/:code/playback/pause', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can control playback' });
    }

    room.playback.isPlaying = false;
    room.playback.lastUpdated = new Date();
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Playback paused', playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resume playback
router.post('/:code/playback/resume', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can control playback' });
    }

    room.playback.isPlaying = true;
    room.playback.lastUpdated = new Date();
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Playback resumed', playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Seek to position
router.post('/:code/playback/seek', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { currentTime } = req.body;

    if (typeof currentTime !== 'number') {
      return res.status(400).json({ error: 'currentTime must be a number' });
    }

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can control playback' });
    }

    room.playback.currentTime = Math.max(0, currentTime);
    room.playback.lastUpdated = new Date();
    room.playback.syncTimestamp = Date.now();
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Playback seeked', playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Skip to next song
router.post('/:code/playback/next', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can control playback' });
    }

    // Playback priority: Queue → Playlist
    if (room.queue.length > 0 && room.playback.currentSource === 'Queue') {
      const nextIndex = room.playback.currentQueueIndex + 1;
      if (nextIndex < room.queue.length) {
        room.playback.currentQueueIndex = nextIndex;
        const nextSong = room.queue[nextIndex];
        room.playback.currentSongId = nextSong.songId;
        room.playback.currentTime = 0;
      } else {
        // Queue finished, switch to playlist
        if (room.playlist.length > 0) {
          room.playback.currentSource = 'Playlist';
          room.playback.currentPlaylistIndex = 0;
          const nextSong = room.playlist[0];
          room.playback.currentSongId = nextSong.songId;
          room.playback.currentQueueIndex = -1;
          room.playback.currentTime = 0;
        } else {
          room.playback.currentSongId = null;
          room.playback.isPlaying = false;
        }
      }
    } else if (room.playlist.length > 0) {
      const nextIndex = room.playback.currentPlaylistIndex + 1;
      if (nextIndex < room.playlist.length) {
        room.playback.currentPlaylistIndex = nextIndex;
        room.playback.currentSource = 'Playlist';
        const nextSong = room.playlist[nextIndex];
        room.playback.currentSongId = nextSong.songId;
        room.playback.currentTime = 0;
      } else {
        room.playback.currentSongId = null;
        room.playback.isPlaying = false;
      }
    } else {
      room.playback.currentSongId = null;
      room.playback.isPlaying = false;
    }

    room.playback.lastUpdated = new Date();
    room.playback.syncTimestamp = Date.now();
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Skipped to next song', playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Skip to previous song
router.post('/:code/playback/previous', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can control playback' });
    }

    // Playback priority: Queue → Playlist
    if (room.queue.length > 0 && room.playback.currentSource === 'Queue') {
      const prevIndex = room.playback.currentQueueIndex - 1;
      if (prevIndex >= 0) {
        room.playback.currentQueueIndex = prevIndex;
        const prevSong = room.queue[prevIndex];
        room.playback.currentSongId = prevSong.songId;
        room.playback.currentTime = 0;
      }
    } else if (room.playlist.length > 0) {
      const prevIndex = room.playback.currentPlaylistIndex - 1;
      if (prevIndex >= 0) {
        room.playback.currentPlaylistIndex = prevIndex;
        room.playback.currentSource = 'Playlist';
        const prevSong = room.playlist[prevIndex];
        room.playback.currentSongId = prevSong.songId;
        room.playback.currentTime = 0;
      }
    }

    room.playback.lastUpdated = new Date();
    room.playback.syncTimestamp = Date.now();
    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Skipped to previous song', playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current playback state
router.get('/:code/playback', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    res.json({ playback: room.playback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PLAY REQUEST ENDPOINTS ============

// Create play request (guests request a song)
router.post('/:code/play-requests', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { songId, title, artist, album, duration, source, notes } = req.body;

    if (!songId || !title || !artist) {
      return res.status(400).json({ error: 'songId, title, and artist are required' });
    }

    const room = await Room.findOne({ code: normalizedCode })
      .populate('host', 'username');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    // Guests cannot make requests if they are the host
    if (room.host._id.toString() === userId.toString()) {
      return res.status(403).json({ error: 'Host cannot request songs' });
    }

    const user = await User.findById(userId);

    const newRequest = {
      _id: new mongoose.Types.ObjectId(),
      songId,
      requestedBy: userId,
      requestedByName: user.username,
      songTitle: title,
      songArtist: artist,
      source: source || 'Uploaded',
      status: 'Pending',
      createdAt: new Date(),
      notes: notes || null
    };

    room.playRequests.push(newRequest);
    room.updatedAt = new Date();
    await room.save();

    // Emit play request created event to all sockets in the room (notify host)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(normalizedCode).emit('newPlayRequest', {
          roomCode: normalizedCode,
          request: newRequest,
          totalRequests: room.playRequests.length
        });
      }
    } catch (e) {
      console.error('Failed to emit newPlayRequest:', e.message);
    }

    res.status(201).json({ message: 'Play request created', request: newRequest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get play requests for a room
router.get('/:code/play-requests', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { status } = req.query;

    const room = await Room.findOne({ code: normalizedCode })
      .populate('playRequests.requestedBy', 'username');

    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.users.some(id => id.toString() === userId.toString())) {
      return res.status(403).json({ error: 'User not in room' });
    }

    let requests = room.playRequests;

    // Filter by status if provided
    if (status) {
      requests = requests.filter(req => req.status === status);
    }

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve play request (host only)
router.put('/:code/play-requests/:requestId/approve', authenticateToken, async (req, res) => {
  try {
    const { code, requestId } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can approve
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can approve requests' });
    }

    const request = room.playRequests.find(req => req._id.toString() === requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Add approved request to the playlist (not the ephemeral queue)
    const playlistItem = {
      _id: new mongoose.Types.ObjectId(),
      songId: request.songId,
      title: request.songTitle,
      artist: request.songArtist,
      album: request.songAlbum || '',
      duration: request.duration || 0,
      source: request.source,
      addedBy: request.requestedBy,
      addedAt: new Date(),
      order: room.playlist.length
    };

    room.playlist.push(playlistItem);

    // Update request status
    request.status = 'Accepted';
    request.respondedAt = new Date();
    request.respondedBy = userId;

    room.updatedAt = new Date();
    await room.save();

    // Emit playlist update to all sockets in the room
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(normalizedCode).emit('playlistUpdated', { roomCode: normalizedCode, playlist: room.playlist, playlistItem });
      }
    } catch (e) {
      console.error('Failed to emit playlistUpdated:', e.message);
    }

    res.json({ message: 'Request approved and added to playlist', playlistItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject play request (host only)
router.put('/:code/play-requests/:requestId/reject', authenticateToken, async (req, res) => {
  try {
    const { code, requestId } = req.params;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const userId = req.user.id;
    const { reason } = req.body;

    const room = await Room.findOne({ code: normalizedCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Only host can reject
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only host can reject requests' });
    }

    const request = room.playRequests.find(req => req._id.toString() === requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Update request status
    request.status = 'Rejected';
    request.respondedAt = new Date();
    request.respondedBy = userId;
    request.rejectionReason = reason || null;

    room.updatedAt = new Date();
    await room.save();

    res.json({ message: 'Request rejected', request });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
