const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Room code to join
  name: { type: String },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPrivate: { type: Boolean, default: false },
  password: { type: String },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // ============ PLAYBACK STATE ============
  playback: {
    currentSongId: { type: String, default: null },
    currentSource: { type: String, enum: ['Queue', 'Playlist'], default: null }, // Where current song came from
    currentTime: { type: Number, default: 0 }, // Playback position in seconds
    duration: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false },
    currentQueueIndex: { type: Number, default: -1 },
    currentPlaylistIndex: { type: Number, default: -1 },
    lastUpdated: { type: Date, default: Date.now },
    syncTimestamp: { type: Number, default: 0 } // Server timestamp (ms) for sync
  },

  // ============ QUEUE (Temporary) ============
  queue: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      songId: { type: String, required: true },
      title: { type: String, required: true },
      artist: { type: String, required: true },
      album: { type: String, default: '' },
      duration: { type: Number, default: 0 },
      source: { type: String, enum: ['Device', 'Uploaded', 'Playlist'], default: 'Uploaded' },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      addedAt: { type: Date, default: Date.now },
      order: { type: Number }
    }
  ],

  // ============ PLAYLIST (Permanent) ============
  playlist: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      songId: { type: String, required: true },
      title: { type: String, required: true },
      artist: { type: String, required: true },
      album: { type: String, default: '' },
      duration: { type: Number, default: 0 },
      source: { type: String, enum: ['Device', 'Uploaded', 'Playlist'], default: 'Uploaded' },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      addedAt: { type: Date, default: Date.now },
      order: { type: Number }
    }
  ],

  // ============ PLAY REQUESTS ============
  playRequests: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      songId: { type: String, required: true },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      requestedByName: { type: String },
      songTitle: { type: String, required: true },
      songArtist: { type: String, required: true },
      source: { type: String, enum: ['Device', 'Uploaded', 'Playlist'], default: 'Uploaded' },
      status: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
      createdAt: { type: Date, default: Date.now },
      respondedAt: { type: Date, default: null },
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectionReason: { type: String, default: null }
    }
  ],

  // ============ METADATA ============
  theme: { type: String, default: 'default' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for performance
roomSchema.index({ code: 1 });
roomSchema.index({ host: 1 });
roomSchema.index({ 'playRequests.status': 1 });
roomSchema.index({ 'playback.lastUpdated': -1 });

module.exports = mongoose.model('Room', roomSchema);
