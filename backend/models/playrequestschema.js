const mongoose = require('mongoose');

const playRequestSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  songId: { type: String, required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByName: { type: String, required: true },
  requestedByAvatar: { type: String, default: null },
  
  // Song details for display
  songTitle: { type: String, required: true },
  songArtist: { type: String, required: true },
  songAlbum: { type: String, default: '' },
  duration: { type: Number, default: 0 },
  songUrl: { type: String, default: null },
  
  // Source of the song
  source: { type: String, enum: ['Device', 'Uploaded', 'Playlist'], default: 'Uploaded' },
  
  // Request status tracking
  status: { type: String, enum: ['Pending', 'Accepted', 'Rejected', 'Playing', 'Played'], default: 'Pending' },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
  respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  
  // Host response metadata
  rejectionReason: { type: String, default: null },
  priority: { type: Number, default: 0 }, // For sorting requests
  notes: { type: String, default: null } // Optional notes from host
});

// Indexes for performance
playRequestSchema.index({ roomId: 1, status: 1 });
playRequestSchema.index({ requestedBy: 1 });
playRequestSchema.index({ roomId: 1, createdAt: -1 });
playRequestSchema.index({ status: 1 });

module.exports = mongoose.model('PlayRequest', playRequestSchema);
