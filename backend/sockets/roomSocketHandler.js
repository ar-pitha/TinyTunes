/**
 * Socket.IO Event Handlers for Room Management & Real-time Sync
 * Implements real-time updates for queue, playlist, playback, and play requests
 */

const Room = require('../models/roomschema');
const User = require('../models/userschema');

/**
 * Socket.IO connection handler
 * Initializes all event listeners for a connected client
 */
function setupRoomSocketHandlers(io, socket) {
  // ============ ROOM CONNECTION EVENTS ============

  /**
   * User joins a room
   * Emits: 'userJoined' to all room members
   */
  socket.on('joinRoom', async (data) => {
    try {
      const { roomCode, userId } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      // Join socket.io room
      socket.join(roomId);

      const room = await Room.findOne({ code: normalizedCode })
        .populate('users', 'username email')
        .populate('host', 'username email');

      if (room) {
        // Broadcast user joined
        io.to(roomId).emit('userJoined', {
          userId,
          room: {
            code: room.code,
            name: room.name,
            users: room.users,
            host: room.host,
            userCount: room.users.length
          }
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to join room: ' + error.message });
    }
  });

  /**
   * User leaves a room
   * Emits: 'userLeft' to remaining room members
   */
  socket.on('leaveRoom', async (data) => {
    try {
      const { roomCode, userId } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      socket.leave(roomId);

      io.to(roomId).emit('userLeft', {
        userId,
        message: 'User left the room'
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to leave room: ' + error.message });
    }
  });

  // ============ QUEUE EVENTS ============

  /**
   * Queue item added
   * Emits: 'queueUpdated' to all room members
   */
  socket.on('queueItemAdded', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('queueUpdated', {
          queue: room.queue,
          queueLength: room.queue.length,
          eventType: 'itemAdded'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Queue update failed: ' + error.message });
    }
  });

  /**
   * Queue item removed
   * Emits: 'queueUpdated' to all room members
   */
  socket.on('queueItemRemoved', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('queueUpdated', {
          queue: room.queue,
          queueLength: room.queue.length,
          eventType: 'itemRemoved'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Queue update failed: ' + error.message });
    }
  });

  /**
   * Queue reordered
   * Emits: 'queueUpdated' to all room members
   */
  socket.on('queueReordered', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('queueUpdated', {
          queue: room.queue,
          eventType: 'reordered'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Queue update failed: ' + error.message });
    }
  });

  /**
   * Queue cleared
   * Emits: 'queueCleared' to all room members
   */
  socket.on('queueCleared', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      io.to(roomId).emit('queueCleared', {
        message: 'Queue has been cleared'
      });
    } catch (error) {
      socket.emit('error', { message: 'Queue clear failed: ' + error.message });
    }
  });

  // ============ PLAYLIST EVENTS ============

  /**
   * Playlist item added
   * Emits: 'playlistUpdated' to all room members
   */
  socket.on('playlistItemAdded', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('playlistUpdated', {
          playlist: room.playlist,
          playlistLength: room.playlist.length,
          eventType: 'itemAdded'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Playlist update failed: ' + error.message });
    }
  });

  /**
   * Playlist item removed
   * Emits: 'playlistUpdated' to all room members
   */
  socket.on('playlistItemRemoved', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('playlistUpdated', {
          playlist: room.playlist,
          playlistLength: room.playlist.length,
          eventType: 'itemRemoved'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Playlist update failed: ' + error.message });
    }
  });

  /**
   * Playlist reordered
   * Emits: 'playlistUpdated' to all room members
   */
  socket.on('playlistReordered', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('playlistUpdated', {
          playlist: room.playlist,
          eventType: 'reordered'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Playlist update failed: ' + error.message });
    }
  });

  // ============ PLAYBACK CONTROL EVENTS ============

  /**
   * Playback state changed (play, pause, resume, seek, next, previous)
   * Emits: 'playbackStateSync' to all room members for real-time sync
   */
  socket.on('playbackStateChanged', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        io.to(roomId).emit('playbackStateSync', {
          playback: room.playback,
          currentSongId: room.playback.currentSongId,
          isPlaying: room.playback.isPlaying,
          currentTime: room.playback.currentTime,
          source: room.playback.currentSource,
          syncTimestamp: room.playback.syncTimestamp,
          serverTime: Date.now()
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Playback sync failed: ' + error.message });
    }
  });

  /**
   * Song changed event
   * Emits: 'songChanged' to all room members when a new song starts playing
   */
  socket.on('songChanged', async (data) => {
    try {
      const { roomCode, currentSongId, source } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        const currentSong = room.playback.currentSource === 'Queue'
          ? room.queue.find(item => item.songId === currentSongId)
          : room.playlist.find(item => item.songId === currentSongId);

        io.to(roomId).emit('songChanged', {
          currentSongId,
          source: room.playback.currentSource,
          song: currentSong || null,
          currentTime: 0,
          isPlaying: true,
          syncTimestamp: room.playback.syncTimestamp
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Song change sync failed: ' + error.message });
    }
  });

  /**
   * Playback time update for continuous sync
   * Emits: 'playbackTimeUpdate' to all room members
   */
  socket.on('playbackTimeUpdate', async (data) => {
    try {
      const { roomCode, currentTime } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      io.to(roomId).emit('playbackTimeUpdate', {
        currentTime,
        serverTime: Date.now()
      });
    } catch (error) {
      socket.emit('error', { message: 'Time update sync failed: ' + error.message });
    }
  });

  // ============ PLAY REQUEST EVENTS ============

  /**
   * New play request created
   * Emits: 'newPlayRequest' to host and 'playRequestCreated' to all room members
   */
  socket.on('playRequestCreated', async (data) => {
    try {
      const { roomCode, request, requestedByName } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        // Notify host of new request
        io.to(roomId).emit('newPlayRequest', {
          request,
          message: `${requestedByName} requested: ${request.songTitle}`
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Play request creation failed: ' + error.message });
    }
  });

  /**
   * Play request approved by host
   * Emits: 'playRequestAccepted' to all room members and requesting user
   */
  socket.on('playRequestApproved', async (data) => {
    try {
      const { roomCode, requestId, userId } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      const room = await Room.findOne({ code: normalizedCode });
      if (room) {
        const request = room.playRequests.find(req => req._id.toString() === requestId);

        io.to(roomId).emit('playRequestAccepted', {
          requestId,
          status: 'Accepted',
          message: 'Your song request was approved and added to the queue',
          request: request || null
        });

        // Emit queue update
        io.to(roomId).emit('queueUpdated', {
          queue: room.queue,
          queueLength: room.queue.length,
          eventType: 'playRequestApproved'
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Play request approval failed: ' + error.message });
    }
  });

  /**
   * Play request rejected by host
   * Emits: 'playRequestRejected' to requesting user
   */
  socket.on('playRequestRejected', async (data) => {
    try {
      const { roomCode, requestId, reason } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();
      const roomId = `room:${normalizedCode}`;

      io.to(roomId).emit('playRequestRejected', {
        requestId,
        status: 'Rejected',
        reason: reason || 'Your request was declined by the host',
        message: 'Play request was rejected'
      });
    } catch (error) {
      socket.emit('error', { message: 'Play request rejection failed: ' + error.message });
    }
  });

  /**
   * Get pending play requests
   * Emits: 'pendingRequests' with list of pending requests
   */
  socket.on('getPendingRequests', async (data) => {
    try {
      const { roomCode } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();

      const room = await Room.findOne({ code: normalizedCode })
        .populate('playRequests.requestedBy', 'username');

      if (room) {
        const pendingRequests = room.playRequests.filter(req => req.status === 'Pending');

        socket.emit('pendingRequests', {
          requests: pendingRequests,
          count: pendingRequests.length
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to get requests: ' + error.message });
    }
  });

  // ============ ROOM STATE SYNC ============

  /**
   * Sync full room state for newly joined users
   * Emits: 'roomStateSync' with complete room state
   */
  socket.on('requestRoomSync', async (data) => {
    try {
      const { roomCode, userId } = data;
      const normalizedCode = String(roomCode || '').trim().toUpperCase();

      const room = await Room.findOne({ code: normalizedCode })
        .populate('users', 'username email')
        .populate('host', 'username email')
        .populate('queue.addedBy', 'username')
        .populate('playlist.addedBy', 'username')
        .populate('playRequests.requestedBy', 'username');

      if (room) {
        socket.emit('roomStateSync', {
          room: {
            code: room.code,
            name: room.name,
            host: room.host,
            users: room.users,
            isPrivate: room.isPrivate,
            theme: room.theme
          },
          playback: room.playback,
          queue: room.queue,
          playlist: room.playlist,
          playRequests: room.playRequests.filter(req => req.status === 'Pending'),
          isHost: room.host._id.toString() === userId.toString()
        });
      }
    } catch (error) {
      socket.emit('error', { message: 'Room sync failed: ' + error.message });
    }
  });

  // ============ ERROR HANDLING ============

  /**
   * Disconnect handler
   */
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  /**
   * Error handler
   */
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
}

module.exports = setupRoomSocketHandlers;
