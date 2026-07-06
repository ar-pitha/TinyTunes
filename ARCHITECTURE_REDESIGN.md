# Room Management & Playlist System - Architecture Redesign

## Executive Summary
Redesigning the music playback system to support:
- **Queue** (temporary): Both host and guests add songs, no approval needed
- **Playlist** (permanent): Room-wide playlist, persistent storage
- **Dual Priority**: Queue songs play first, then Playlist
- **Host Approval**: Guests request to play, host approves/rejects
- **Bug Fix**: Adding songs never interrupts current playback

---

## ARCHITECTURE OVERVIEW

### 1. System Components

```
┌─────────────────────────────────────────────────────┐
│               Frontend (React)                       │
├─────────────────────────────────────────────────────┤
│  Components:                                         │
│  ├─ Player (core playback)                          │
│  ├─ Playlist Panel (persistent room playlist)       │
│  ├─ Queue Panel (temporary playback queue)          │
│  ├─ Device Songs (with Play/Queue/Playlist actions) │
│  ├─ Uploaded Songs (with Play/Queue/Playlist)      │
│  ├─ Host Request Panel (approve/reject)             │
│  └─ Play Request Notifications (for guests)        │
│                                                      │
│  Contexts:                                           │
│  ├─ PlaylistContext                                 │
│  ├─ QueueContext                                    │
│  ├─ PlayRequestContext                              │
│  └─ PlaybackContext                                 │
└──────────────────────────────────────────┬──────────┘
                                           │
                    ┌──────────────────────┤
                    │      Socket.IO       │
                    └──────────────────────┤
                                           │
┌──────────────────────────────────────────┴──────────┐
│             Backend (Node.js/Express)                │
├─────────────────────────────────────────────────────┤
│  Routes:                                             │
│  ├─ /api/rooms/:roomId/playlist (CRUD)              │
│  ├─ /api/rooms/:roomId/queue (CRUD)                 │
│  ├─ /api/rooms/:roomId/playback (control)           │
│  ├─ /api/rooms/:roomId/playRequests (CRUD)          │
│  └─ /api/songs (existing)                           │
│                                                      │
│  Socket Handlers:                                    │
│  ├─ playlistUpdated                                 │
│  ├─ queueUpdated                                    │
│  ├─ playRequest (new)                               │
│  ├─ approvePlayRequest                              │
│  ├─ rejectPlayRequest                               │
│  └─ playbackStateSync                               │
└──────────────────────────────────────────┬──────────┘
                                           │
┌──────────────────────────────────────────┴──────────┐
│           Database (MongoDB)                        │
├─────────────────────────────────────────────────────┤
│  Collections:                                        │
│  ├─ rooms (updated with playlist, queue, etc.)      │
│  ├─ playRequests (new)                              │
│  └─ songs (existing)                                │
└─────────────────────────────────────────────────────┘
```

---

## 2. Data Flow

### Adding Song to Queue (No Interruption)
```
User Clicks "Add to Queue"
    ↓
Frontend: addToQueue(song)
    ├─ Don't change currentSong
    ├─ Don't reset audio element
    ├─ Just append to queue array
    └─ Emit: queueUpdated event
    ↓
Backend receives queueUpdated
    ├─ Append song to room.queue
    ├─ Save to database
    └─ Broadcast to all users
    ↓
All Users receive queueUpdated
    ├─ Update local queue state
    ├─ Update UI
    └─ NO audio element changes
    ↓
Result: Current song continues playing ✓
```

### Adding Song to Playlist
```
User Clicks "Add to Playlist"
    ↓
Frontend: addToPlaylist(song)
    ├─ Don't change currentSong
    ├─ Append to playlist array
    └─ Emit: playlistUpdated event
    ↓
Backend receives playlistUpdated
    ├─ Append song to room.playlist
    ├─ Save to database
    └─ Broadcast to all users
    ↓
All Users receive playlistUpdated
    ├─ Update local playlist state
    └─ Update UI
    ↓
Result: Current song continues playing ✓
```

### Guest Requesting to Play
```
Guest Clicks "Play" on a song
    ↓
Frontend: requestToPlay(song)
    ├─ Create playRequest object
    ├─ Send to backend
    └─ Show "Waiting for Host Approval..."
    ↓
Backend receives playRequest
    ├─ Store in room.playRequests
    ├─ Emit: newPlayRequest to host
    └─ Save to database
    ↓
Host receives newPlayRequest
    ├─ Show in Host Request Panel
    ├─ Shows: User Name, Song Name, Accept/Reject buttons
    │
    ├─ If Host clicks Accept:
    │  ├─ Approve request
    │  ├─ Change currentSong
    │  ├─ Emit: approvePlayRequest
    │  ├─ Emit: songChanged (to all)
    │  └─ Result: Everyone hears new song from start
    │
    └─ If Host clicks Reject:
       ├─ Reject request
       ├─ Emit: rejectPlayRequest
       └─ Result: Notify guest only
```

### Playback Priority Flow
```
Song Ends
    ↓
Check Queue:
    ├─ If Queue has songs:
    │  ├─ Play next Queue song
    │  ├─ Increment queueIndex
    │  └─ Continue
    │
    └─ If Queue is empty:
       ├─ Check Playlist:
       │  ├─ If Playlist has songs:
       │  │  ├─ Play next Playlist song
       │  │  ├─ Increment playlistIndex
       │  │  └─ Continue
       │  │
       │  └─ If Playlist is empty:
       │     └─ Stop playback
```

---

## 3. Database Schema Changes

### Room Schema Update
```javascript
// Before
{
  _id: ObjectId,
  code: String,
  host: User,
  users: [User],
  createdAt: Date
}

// After
{
  _id: ObjectId,
  code: String,
  host: User,
  users: [User],
  
  // New: Playlist (permanent)
  playlist: [
    {
      songId: ObjectId,
      title: String,
      artist: String,
      album: String,
      duration: Number,
      addedBy: ObjectId (userId),
      addedAt: Date,
      order: Number
    }
  ],
  
  // New: Queue (temporary)
  queue: [
    {
      songId: ObjectId,
      title: String,
      artist: String,
      album: String,
      duration: Number,
      addedBy: ObjectId (userId),
      addedAt: Date,
      order: Number
    }
  ],
  
  // New: Play Requests
  playRequests: [
    {
      _id: ObjectId,
      songId: ObjectId,
      requestedBy: ObjectId (userId),
      source: String (Device, Uploaded, Playlist),
      status: String (Pending, Accepted, Rejected),
      createdAt: Date,
      respondedAt: Date,
      respondedBy: ObjectId (userId)
    }
  ],
  
  // New: Current Playback State
  playback: {
    currentSongId: ObjectId,
    currentSource: String (Queue, Playlist),
    currentQueueIndex: Number,
    currentPlaylistIndex: Number,
    currentTime: Number,
    duration: Number,
    isPlaying: Boolean,
    lastUpdated: Date
  },
  
  createdAt: Date,
  updatedAt: Date
}
```

### PlayRequest Schema (New Collection)
```javascript
{
  _id: ObjectId,
  roomId: ObjectId,
  songId: ObjectId,
  requestedBy: ObjectId (userId),
  requestedByName: String,
  songTitle: String,
  songArtist: String,
  source: String (Device, Uploaded, Playlist),
  status: String (Pending, Accepted, Rejected),
  createdAt: Date,
  respondedAt: Date,
  respondedBy: ObjectId (userId),
  rejectionReason: String (optional)
}
```

---

## 4. REST API Design

### Queue Endpoints
```
POST   /api/rooms/:roomId/queue
  Body: { songId, title, artist, album, duration, source }
  Response: { queue: [...], message: "Added to queue" }

DELETE /api/rooms/:roomId/queue/:queueItemId
  Response: { queue: [...], message: "Removed from queue" }

PUT    /api/rooms/:roomId/queue/reorder
  Body: { items: [{id, order}, ...] }  (Host only)
  Response: { queue: [...] }

GET    /api/rooms/:roomId/queue
  Response: { queue: [...] }

DELETE /api/rooms/:roomId/queue
  Response: { queue: [], message: "Queue cleared" }  (Host only)
```

### Playlist Endpoints
```
POST   /api/rooms/:roomId/playlist
  Body: { songId, title, artist, album, duration, source }
  Response: { playlist: [...], message: "Added to playlist" }

DELETE /api/rooms/:roomId/playlist/:playlistItemId
  Response: { playlist: [...] }  (Host only)

PUT    /api/rooms/:roomId/playlist/reorder
  Body: { items: [{id, order}, ...] }  (Host only)
  Response: { playlist: [...] }

GET    /api/rooms/:roomId/playlist
  Response: { playlist: [...] }

GET    /api/rooms/:roomId/playlist/search
  Query: { q: "search term" }
  Response: { results: [...] }
```

### Playback Endpoints
```
POST   /api/rooms/:roomId/playback/play
  Body: { songId, source }
  Response: { playback: {...} }  (Host only)

POST   /api/rooms/:roomId/playback/pause
  Response: { playback: {...} }  (Host only)

POST   /api/rooms/:roomId/playback/resume
  Response: { playback: {...} }  (Host only)

POST   /api/rooms/:roomId/playback/seek
  Body: { currentTime }
  Response: { playback: {...} }

POST   /api/rooms/:roomId/playback/next
  Response: { playback: {...} }

POST   /api/rooms/:roomId/playback/previous
  Response: { playback: {...} }

GET    /api/rooms/:roomId/playback
  Response: { playback: {...} }
```

### Play Request Endpoints
```
POST   /api/rooms/:roomId/playRequests
  Body: { songId, source }
  Response: { request: {...}, message: "Request sent" }  (Guest)

GET    /api/rooms/:roomId/playRequests
  Query: { status: "Pending" }
  Response: { requests: [...] }

PUT    /api/rooms/:roomId/playRequests/:requestId/approve
  Response: { request: {...}, message: "Request approved" }  (Host only)

PUT    /api/rooms/:roomId/playRequests/:requestId/reject
  Body: { reason }
  Response: { request: {...}, message: "Request rejected" }  (Host only)

GET    /api/rooms/:roomId/playRequests/:requestId
  Response: { request: {...} }
```

---

## 5. Socket.IO Events

### Event Structure
```javascript
// Queue Events
socket.on('queueUpdated', (data) => {
  // { roomId, queue: [...], action: 'add'|'remove'|'reorder'|'clear' }
})

// Playlist Events
socket.on('playlistUpdated', (data) => {
  // { roomId, playlist: [...], action: 'add'|'remove'|'reorder' }
})

// Play Request Events
socket.on('newPlayRequest', (data) => {
  // { roomId, request: {...} } → To Host only
})

socket.on('playRequestAccepted', (data) => {
  // { roomId, request: {...}, playback: {...} } → To all
})

socket.on('playRequestRejected', (data) => {
  // { roomId, request: {...} } → To requesting guest
})

// Playback Events
socket.on('playbackStateSync', (data) => {
  // { roomId, playback: {...} } → To all
})

socket.on('songChanged', (data) => {
  // { roomId, playback: {...}, fromQueue: boolean } → To all
})

socket.on('playbackUpdated', (data) => {
  // { roomId, isPlaying: boolean, currentTime: number } → To all (throttled)
})

// Queue Reorder
socket.on('queueReordered', (data) => {
  // { roomId, queue: [...] } → To all (Host only)
})

// Playlist Reorder
socket.on('playlistReordered', (data) => {
  // { roomId, playlist: [...] } → To all (Host only)
})
```

---

## 6. Frontend State Management

### Recommended Context Structure
```javascript
// PlaylistContext
{
  playlist: [{id, title, artist, album, duration, addedBy, ...}],
  setPlaylist: (playlist) => {},
  addToPlaylist: (song) => {},
  removeFromPlaylist: (id) => {},
  reorderPlaylist: (newOrder) => {} // Host only
}

// QueueContext
{
  queue: [{id, title, artist, album, duration, ...}],
  queueIndex: 0,
  setQueue: (queue) => {},
  addToQueue: (song) => {},
  removeFromQueue: (id) => {},
  reorderQueue: (newOrder) => {} // Host only,
  clearQueue: () => {} // Host only
}

// PlayRequestContext
{
  playRequests: [{id, songId, requestedBy, status, ...}],
  addPlayRequest: (request) => {},
  approveRequest: (id) => {},
  rejectRequest: (id) => {}
}

// PlaybackContext
{
  currentSong: {...},
  currentSource: 'Queue' | 'Playlist',
  isPlaying: boolean,
  currentTime: number,
  duration: number,
  
  play: (song, source) => {},
  pause: () => {},
  resume: () => {},
  seek: (time) => {},
  next: () => {},
  previous: () => {}
}
```

---

## 7. Component Structure

### Frontend Folder Structure
```
frontend/src/components/
├── Player/
│   ├── Player.jsx
│   ├── Controls.jsx
│   ├── ProgressBar.jsx
│   └── Player.css
│
├── Playlist/
│   ├── PlaylistPanel.jsx
│   ├── PlaylistItem.jsx
│   ├── PlaylistSearch.jsx
│   └── Playlist.css
│
├── Queue/
│   ├── QueuePanel.jsx
│   ├── QueueItem.jsx
│   ├── QueueReorder.jsx
│   └── Queue.css
│
├── DeviceSongs/
│   ├── DeviceSongsPanel.jsx
│   ├── DeviceSongItem.jsx
│   └── DeviceSongs.css
│
├── UploadedSongs/
│   ├── UploadedSongsPanel.jsx
│   ├── UploadedSongItem.jsx
│   └── UploadedSongs.css
│
├── PlayRequests/
│   ├── HostRequestPanel.jsx (for Host)
│   ├── RequestItem.jsx
│   ├── PlayRequestNotification.jsx (for Guest)
│   └── PlayRequests.css
│
├── RoomManagement/
│   ├── RoomInfo.jsx
│   ├── UserList.jsx
│   └── RoomManagement.css
│
└── contexts/
    ├── PlaylistContext.js
    ├── QueueContext.js
    ├── PlayRequestContext.js
    ├── PlaybackContext.js
    └── SocketContext.js
```

---

## 8. Implementation Phases

### Phase 1: Database & Schema (Backend)
- [ ] Update Room schema
- [ ] Create PlayRequest schema
- [ ] Create indexes for queries
- [ ] Test schema

### Phase 2: Backend APIs (Node.js/Express)
- [ ] Queue CRUD endpoints
- [ ] Playlist CRUD endpoints
- [ ] Playback control endpoints
- [ ] Play Request endpoints
- [ ] Add permission checks

### Phase 3: Socket.IO Events (Backend)
- [ ] Implement event handlers
- [ ] Implement room broadcasting
- [ ] Implement real-time sync
- [ ] Add event validation

### Phase 4: Frontend Contexts
- [ ] PlaylistContext
- [ ] QueueContext
- [ ] PlayRequestContext
- [ ] PlaybackContext (update)

### Phase 5: Frontend Components
- [ ] PlaylistPanel
- [ ] QueuePanel
- [ ] DeviceSongItem (with actions)
- [ ] UploadedSongItem (with actions)
- [ ] HostRequestPanel
- [ ] PlayRequestNotification

### Phase 6: Frontend Logic
- [ ] Connect contexts to components
- [ ] Implement playback priority logic
- [ ] Handle Socket.IO events
- [ ] Bug fix: Prevent audio element reset

### Phase 7: Integration & Testing
- [ ] E2E testing
- [ ] Real-time sync testing
- [ ] Permission testing
- [ ] Performance testing

---

## 9. Key Implementation Details

### Bug Fix: Preventing Audio Element Reset
**Problem**: Adding songs to queue/playlist was resetting playback
**Solution**: Never modify `currentSong` when adding to queue/playlist
```javascript
// ❌ WRONG - This resets audio element
setCurrentSong(song);

// ✅ CORRECT - Only update queue, don't change current song
setQueue([...queue, song]);
```

### Playback Priority Logic
```javascript
const handleSongEnd = () => {
  if (queue.length > 0 && queueIndex < queue.length - 1) {
    // Play next queue song
    playNextQueueSong();
  } else if (queue.length === 0) {
    // Queue empty, play next playlist song
    playNextPlaylistSong();
  } else {
    // Stop playback
    stop();
  }
};
```

### Host Approval Request Flow
```javascript
// Guest requests to play
const requestToPlay = (song) => {
  emitSocket('playRequest', {
    roomId,
    songId: song.id,
    source: 'Device' | 'Uploaded' | 'Playlist'
  });
  // Show "Waiting for Host Approval..."
};

// Host receives request
socket.on('newPlayRequest', (request) => {
  // Show in HostRequestPanel
  // User clicks Accept or Reject
});

// Host approves
const approveRequest = (requestId) => {
  emitSocket('approvePlayRequest', { roomId, requestId });
  // Server changes currentSong and broadcasts
};
```

---

## 10. Testing Strategy

### Unit Tests
- Queue add/remove/reorder logic
- Playlist add/remove/reorder logic
- Playback priority logic
- Permission checks

### Integration Tests
- Add to queue → Don't interrupt playback
- Add to playlist → Don't interrupt playback
- Queue song ends → Play playlist song
- Guest request → Host approval

### E2E Tests
- Host and 2 guests in room
- Guest adds device song to queue
- Host plays device song (request approval)
- Queue empties, playlist plays
- Real-time sync verification

---

## 11. Performance Optimization

- ✅ Use memoization for components
- ✅ Throttle playback sync events (every 1-2 seconds)
- ✅ Don't recreate audio element
- ✅ Use functional setState to avoid stale closures
- ✅ Lazy load device songs
- ✅ Index database queries for fast lookups
- ✅ Implement request deduplication for guests

---

## 12. Migration Path

1. Deploy database schema changes
2. Deploy backend endpoints (APIs & Socket events)
3. Deploy frontend contexts
4. Deploy frontend components
5. Enable feature flag for new system
6. Monitor and test in production
7. Remove old queue logic gradually

---

## Next Steps
1. Review this architecture
2. Confirm database schema changes
3. Begin Phase 1 (Database)
4. Follow phases sequentially

