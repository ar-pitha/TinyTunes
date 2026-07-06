// App.js - Main React Application
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, Users, Settings, Upload, Music, Heart, Clock, Moon, Sun } from 'lucide-react';
import '../components/music.css'; // Assuming you have a CSS file for styling

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Context providers and integration
import { QueueProvider, useQueue } from '../contexts/QueueContext';
import { PlaylistProvider } from '../contexts/PlaylistContext';
import { PlayRequestProvider, usePlayRequest } from '../contexts/PlayRequestContext';
import { PlaybackProvider, usePlayback } from '../contexts/PlaybackContext';
import Player from './Player';

const InnerApp = ({ token, user }) => {
  const [currentSong, setCurrentSong] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState('none'); // 'none', 'one', 'all'
  const [darkMode, setDarkMode] = useState(false);
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [roomUsers, setRoomUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [activeTab, setActiveTab] = useState('library');
  const [favorites, setFavorites] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFields, setUploadFields] = useState({
    title: '',
    artist: '',
    album: '',
    duration: ''
  });
  const [favoritesList, setFavoritesList] = useState([]);
  const [deviceSongs, setDeviceSongs] = useState([]);
  const [deviceAccessError, setDeviceAccessError] = useState('');
  const [deviceFileInputRef] = useState(() => React.createRef());
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);

  // audio element is managed by Player component via playback integration
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

  // Context hooks (available when InnerApp is rendered inside providers)
  const queueCtx = useQueue();
  const playRequestCtx = usePlayRequest();
  const playbackCtx = usePlayback();


  // Initialize socket connection (minimal listeners here)
  useEffect(() => {
    socketRef.current = io(BACKEND_URL);

    // leave detailed event handling to integration hook / contexts

    return () => {
      try { socketRef.current.disconnect(); } catch (e) {}
    };
  }, []);

  // Playback integration will be initialized in the next step (Phase 6)

  // Audio event handlers are managed by Player integration

  // Initialize queue when current song changes
  useEffect(() => {
    if (currentSong && queue.length === 0) {
      setQueue([currentSong]);
      setQueueIndex(0);
    }
  }, [currentSong?.id]);

  // Fetch songs from backend (use cache for instant UI)
  const fetchSongs = async () => {
    if (!token) return;
    // try cached playlist first
    const cached = sessionStorage.getItem('comp_playlist_v1');
    if (cached) {
      try {
        const list = JSON.parse(cached);
        setPlaylist(list);
      } catch (e) { /* ignore */ }
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/songs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch songs');
      const songs = await res.json();
      if (!Array.isArray(songs)) {
        setPlaylist([]);
        return;
      }
      const mapped = songs.map(song => ({
        id: song._id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        url: `${BACKEND_URL}/api/songs/${song._id}/stream`
      }));
      setPlaylist(mapped);
      try { sessionStorage.setItem('comp_playlist_v1', JSON.stringify(mapped)); } catch (e) {}
    } catch (err) {
      console.error("Failed to fetch songs", err);
      // keep cached playlist if available
    }
  };

  // Fetch favorites (with cache)
  const fetchFavorites = async () => {
    if (!token) return;
    const cachedFavs = sessionStorage.getItem('comp_favs_v1');
    if (cachedFavs) {
      try { setFavoritesList(JSON.parse(cachedFavs)); } catch (e) {}
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/favorites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch favorites');
      const favs = await res.json();
      if (!Array.isArray(favs)) {
        setFavoritesList([]);
        return;
      }
      const mapped = favs.map(fav => ({
        id: fav.song._id,
        title: fav.song.title,
        artist: fav.song.artist,
        album: fav.song.album,
        duration: fav.song.duration,
        url: `${BACKEND_URL}/api/songs/${fav.song._id}/stream`
      }));
      setFavoritesList(mapped);
      try { sessionStorage.setItem('comp_favs_v1', JSON.stringify(mapped)); } catch (e) {}
    } catch (err) {
      console.error("Failed to fetch favorites", err);
      // keep cached favorites if present
    }
  };

  // On mount, fetch songs (and optionally prompt for token)
  //   useEffect(() => {
  //     // For demo: prompt for token if not set
  //     if (!token) {
  //       const t = window.prompt("Enter JWT token for backend API:");
  //       setToken(t || "");
  //     }
  //   }, []);

  useEffect(() => {
    if (token) {
      fetchSongs();
      fetchFavorites();
    }
  }, [token]);

  // File upload handler (upload to backend)
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    for (const file of files) {
      if (file.type.startsWith('audio/')) {
        const formData = new FormData();
        formData.append('song', file);
        formData.append('title', file.name.replace(/\.[^/.]+$/, ""));
        formData.append('artist', 'Unknown Artist');
        formData.append('album', 'Unknown Album');
        formData.append('duration', 0);
        try {
          await fetch(`${BACKEND_URL}/api/songs/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          });
        } catch (err) {
          console.error("Upload failed", err);
        }
      }
    }
    // Refresh songs after upload
    fetchSongs();
  };

  // Show upload modal when user selects a file
  const handleFileInputChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setUploadFile(file);
      setUploadFields({
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: '',
        album: '',
        duration: ''
      });
      setUploadModalOpen(true);
    }
  };

  // Handle upload form submit
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('song', uploadFile);
    formData.append('title', uploadFields.title);
    formData.append('artist', uploadFields.artist);
    formData.append('album', uploadFields.album);
    formData.append('duration', uploadFields.duration || 0);
    try {
      const res = await fetch(`${BACKEND_URL}/api/songs/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      
      if (res.ok) {
        const uploadedSong = await res.json();
        
        // Create song object with proper URL
        const newSong = {
          id: uploadedSong._id,
          title: uploadedSong.title,
          artist: uploadedSong.artist,
          album: uploadedSong.album,
          duration: uploadedSong.duration,
          url: `${BACKEND_URL}/api/songs/${uploadedSong._id}/stream`
        };
        
        // Add to queue without interrupting current playback
        addToQueue(newSong);
      }
      
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadFields({ title: '', artist: '', album: '', duration: '' });
      
      // Refresh playlist in background
      fetchSongs();
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  // Add/remove favorite
  const toggleFavorite = async (song) => {
    if (!token) return;
    try {
      await fetch(`${BACKEND_URL}/api/favorites`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ songId: song.id })
      });
      fetchFavorites();
    } catch (err) {
      // handle error
    }
  };

  // Playback controls
  // Helper function to safely add song to queue or create a play request
  // Uses Queue and PlayRequest contexts when available (wired in wrapper)
  const defaultAddToQueue = async (song) => {
    if (!song || !currentSong) {
      setCurrentSong(song);
      setQueue([song]);
      setQueueIndex(0);
      return;
    }
    // If we have queue context and user is host, use server-backed queue
    if (queueCtx && queueCtx.addToQueue && token && room) {
      try {
        await queueCtx.addToQueue(song, room.code, token);
        return;
      } catch (err) {
        console.warn('Queue add failed, falling back to local queue', err);
      }
    }

    // If not host, create a play request instead (if possible)
    if (!isHost && playRequestCtx && playRequestCtx.createPlayRequest && token && room) {
      try {
        await playRequestCtx.createPlayRequest(song, room.code, token);
        return;
      } catch (err) {
        console.warn('Play request failed, falling back to local queue', err);
      }
    }

    // Fallback: local queue update
    setQueue(prevQueue => {
      if (prevQueue.length === 0) return [currentSong, song];
      return [...prevQueue, song];
    });
  };

  const togglePlay = () => {
    if (!currentSong) return;
    
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    
    if (newIsPlaying) {
      // audio is now handled by Player integration
    } else {
      // audio is now handled by Player integration
    }
    
    // Sync with room if host (use playback context time if available)
    if (isHost && room) {
      const time = (playbackCtx && playbackCtx.currentTime) || currentTime || 0;
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: currentSong,
        currentTime: time,
        isPlaying: newIsPlaying
      });
    }
  };

  const handleNext = () => {
    // Check if there's a queued song first
    if (queue.length > 0 && queueIndex < queue.length - 1) {
      const nextQueueIndex = queueIndex + 1;
      const nextSong = queue[nextQueueIndex];
      setCurrentSong(nextSong);
      setQueueIndex(nextQueueIndex);
      setRecentlyPlayed(prev => [nextSong, ...prev.slice(0, 9)]);
      
      // Sync with room if host
      if (isHost && room) {
        socketRef.current.emit('sync-playback', {
          roomCode: room.code,
          song: nextSong,
          currentTime: 0,
          isPlaying: true
        });
      }
      return;
    }
    
    // Fall back to playlist navigation
    if (!playlist.length) return;
    
    const currentIndex = playlist.findIndex(song => song.id === currentSong?.id);
    let nextIndex;
    
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = (currentIndex + 1) % playlist.length;
    }
    
    const nextSong = playlist[nextIndex];
    setCurrentSong(nextSong);
    setRecentlyPlayed(prev => [nextSong, ...prev.slice(0, 9)]);
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: nextSong,
        currentTime: 0,
        isPlaying: true
      });
    }
  };

  const handlePrevious = () => {
    // Check if there's a queued song first
    if (queue.length > 0 && queueIndex > 0) {
      const prevQueueIndex = queueIndex - 1;
      const prevSong = queue[prevQueueIndex];
      setCurrentSong(prevSong);
      setQueueIndex(prevQueueIndex);
      
      // Sync with room if host
      if (isHost && room) {
        socketRef.current.emit('sync-playback', {
          roomCode: room.code,
          song: prevSong,
          currentTime: 0,
          isPlaying: true
        });
      }
      return;
    }
    
    // Fall back to playlist navigation
    if (!playlist.length) return;
    
    const currentIndex = playlist.findIndex(song => song.id === currentSong?.id);
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    const prevSong = playlist[prevIndex];
    setCurrentSong(prevSong);
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: prevSong,
        currentTime: 0,
        isPlaying: true
      });
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    setCurrentTime(newTime);
    // Seek via playback context if host, otherwise update UI only
    if (isHost && playbackCtx && playbackCtx.seekTo && room) {
      playbackCtx.seekTo(newTime, room.code, token).catch(err => console.warn('Seek failed', err));
    }
    
    // Sync with room if host
    if (isHost && room) {
      socketRef.current.emit('sync-playback', {
        roomCode: room.code,
        song: currentSong,
        currentTime: newTime,
        isPlaying: isPlaying
      });
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Track recently played songs
  useEffect(() => {
    if (currentSong) {
      setRecentlyPlayed(prev => {
        const exists = prev.find(s => s.id === currentSong.id);
        if (exists) return prev;
        return [currentSong, ...prev.filter(s => s.id !== currentSong.id).slice(0, 9)];
      });
    }
  }, [currentSong]);

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    socketRef.current.emit('create-room', {
      code,
      user: user || { id: Date.now(), name: 'Anonymous' }
    });
  };

  const joinRoom = () => {
    if (!roomCode) return;
    socketRef.current.emit('join-room', {
      code: roomCode,
      user: user || { id: Date.now(), name: 'Anonymous' }
    });
  };

  const leaveRoom = () => {
    socketRef.current.emit('leave-room', { code: room.code });
    setRoom(null);
    setRoomUsers([]);
    setIsHost(false);
  };

  // Persist activeTab in localStorage
  useEffect(() => {
    const storedTab = localStorage.getItem('activeTab');
    if (storedTab) setActiveTab(storedTab);
  }, []);
  
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Device songs: ask permission and read files
  const handleDeviceSongs = async () => {
    setDeviceAccessError('');
    // Try File System Access API
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const songs = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file' && entry.name.match(/\.(mp3|wav|ogg|flac)$/i)) {
            const file = await entry.getFile();
            songs.push({
              id: file.name + file.size + file.lastModified,
              title: file.name.replace(/\.[^/.]+$/, ""),
              artist: 'Device',
              album: 'Downloads',
              duration: 0,
              url: URL.createObjectURL(file),
              file
            });
          }
        }
        setDeviceSongs(songs);
      } catch (err) {
        setDeviceAccessError('Permission denied or no access to device files.');
        setDeviceSongs([]);
      }
    } else {
      // Fallback: ask user to select files
      deviceFileInputRef.current.click();
    }
  };

  const handleDeviceFileInput = (event) => {
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('audio/'));
    const songs = files.map(file => ({
      id: file.name + file.size + file.lastModified,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: 'Device',
      album: 'Downloads',
      duration: 0,
      url: URL.createObjectURL(file),
      file
    }));
    setDeviceSongs(songs);
  };

  // Restore deviceSongs metadata on mount (no file/url)
  // Note: Device songs with blob URLs can't be persisted across sessions
  useEffect(() => {
    // Device songs are loaded fresh each time via the file picker
    // No need to restore from localStorage
  }, []);

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      
      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="upload-modal">
          <form className="upload-form" onSubmit={handleUploadSubmit}>
            <h3>Upload Song</h3>
            <label>
              Title:
              <input
                type="text"
                value={uploadFields.title}
                onChange={e => setUploadFields(f => ({ ...f, title: e.target.value }))}
                required
              />
            </label>
            <label>
              Artist:
              <input
                type="text"
                value={uploadFields.artist}
                onChange={e => setUploadFields(f => ({ ...f, artist: e.target.value }))}
                required
              />
            </label>
            <label>
              Album:
              <input
                type="text"
                value={uploadFields.album}
                onChange={e => setUploadFields(f => ({ ...f, album: e.target.value }))}
                required
              />
            </label>
            <label>
              Duration (seconds):
              <input
                type="number"
                value={uploadFields.duration}
                onChange={e => setUploadFields(f => ({ ...f, duration: e.target.value }))}
                min="0"
                required
              />
            </label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit">Upload</button>
              <button type="button" onClick={() => setUploadModalOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      {/* Header */}
      <header className="header">
        <div className="logo">
          <Music className="logo-icon" />
          <h1>MusicSync</h1>
        </div>
        <div className="header-controls">
          <button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={() => fileInputRef.current.click()}>
            <Upload size={20} />
          </button>
          <button onClick={handleDeviceSongs}>
            <Music size={20} />
            Device Songs
          </button>
          <input
            ref={deviceFileInputRef}
            type="file"
            multiple
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleDeviceFileInput}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="nav">
            <button 
              className={activeTab === 'library' ? 'active' : ''}
              onClick={() => setActiveTab('library')}
            >
              <Music size={20} />
              Library
            </button>
            <button 
              className={activeTab === 'favorites' ? 'active' : ''}
              onClick={() => setActiveTab('favorites')}
            >
              <Heart size={20} />
              Favorites
            </button>
            <button 
              className={activeTab === 'recent' ? 'active' : ''}
              onClick={() => setActiveTab('recent')}
            >
              <Clock size={20} />
              Recent
            </button>
            <button 
              className={activeTab === 'rooms' ? 'active' : ''}
              onClick={() => setActiveTab('rooms')}
            >
              <Users size={20} />
              Rooms
            </button>
            <button
              className={activeTab === 'device' ? 'active' : ''}
              onClick={() => setActiveTab('device')}
            >
              <Music size={20} />
              Device Songs
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="content">
          {activeTab === 'library' && (
            <div className="library">
              <h2>My Library</h2>
              {playlist.length === 0 ? (
                <div className="empty-state">
                  <Music size={48} />
                  <p>No songs in your library</p>
                  <button onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                    Upload Songs
                  </button>
                </div>
              ) : (
                <div className="song-list">
                  {playlist.map(song => (
                    <div 
                      key={song.id} 
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => addToQueue(song)}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                      </div>
                      <div className="song-actions">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(song);
                          }}
                          className={favoritesList.some(fav => fav.id === song.id) ? 'favorite' : ''}
                        >
                          <Heart size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'favorites' && (
            <div className="favorites">
              <h2>Favorites</h2>
              <div className="song-list">
                {favoritesList.length === 0 ? (
                  <div className="empty-state">
                    <Heart size={48} />
                    <p>No favorite songs yet</p>
                  </div>
                ) : (
                  favoritesList.map(song => (
                    <div 
                      key={song.id} 
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => addToQueue(song)}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'recent' && (
            <div className="recent">
              <h2>Recently Played</h2>
              <div className="song-list">
                {recentlyPlayed.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={48} />
                    <p>No songs played recently</p>
                  </div>
                ) : (
                  recentlyPlayed.map(song => (
                    <div 
                      key={song.id} 
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => addToQueue(song)}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="rooms">
              <h2>Rooms</h2>
              {!room ? (
                <div className="room-controls">
                  <button onClick={createRoom} className="create-room-btn">
                    Create Room
                  </button>
                  <div className="join-room">
                    <input
                      type="text"
                      placeholder="Enter room code"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                    />
                    <button onClick={joinRoom}>Join</button>
                  </div>
                </div>
              ) : (
                <div className="room-info">
                  <h3>Room: {room.code}</h3>
                  <p>Users ({roomUsers.length}):</p>
                  <ul>
                    {roomUsers.map(user => (
                      <li key={user.id}>
                        {user.name} {user.isHost ? '(Host)' : ''}
                      </li>
                    ))}
                  </ul>
                  <button onClick={leaveRoom}>Leave Room</button>
                  {/* Show playlist in room */}
                  <div style={{ marginTop: '2rem' }}>
                    <h4>Room Playlist</h4>
                    <div className="song-list">
                      {[...playlist, ...deviceSongs].map(song => (
                        <div
                          key={song.id}
                          className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                          onClick={() => {
                            if (song.url) {
                              const isCurrentSong = currentSong?.id === song.id;
                              
                              if (!isCurrentSong) {
                                // Add to queue (uses safe queue function)
                                addToQueue(song);
                                
                                // Sync playback for room only if starting a new song
                                if (isHost && room && !currentSong) {
                                  socketRef.current.emit('sync-playback', {
                                    roomCode: room.code,
                                    song: song,
                                    currentTime: 0,
                                    isPlaying: true
                                  });
                                }
                              }
                              // If clicking the current song, do nothing (no reset)
                            }
                          }}
                          style={{ opacity: song.url ? 1 : 0.5, pointerEvents: song.url ? 'auto' : 'none' }}
                        >
                          <div className="song-info">
                            <h3>{song.title}</h3>
                            <p>{song.artist} • {song.album}</p>
                            {!song.url && <span style={{ color: '#ef4444', fontSize: '0.9em' }}>File access required for playback</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'device' && (
            <div className="device-songs">
              <h2>Device Songs</h2>
              {deviceAccessError && <div className="auth-error">{deviceAccessError}</div>}
              {deviceSongs.length === 0 ? (
                <div className="empty-state">
                  <Music size={48} />
                  <p>No device songs found. Click "Device Songs" above to grant access.</p>
                </div>
              ) : (
                <div className="song-list">
                  {deviceSongs.map(song => (
                    <div
                      key={song.id}
                      className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                      onClick={() => song.url && addToQueue(song)}
                      style={{ opacity: song.url ? 1 : 0.5, pointerEvents: song.url ? 'auto' : 'none' }}
                    >
                      <div className="song-info">
                        <h3>{song.title}</h3>
                        <p>{song.artist} • {song.album}</p>
                        {!song.url && <span style={{ color: '#ef4444', fontSize: '0.9em' }}>File access required for playback</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Player */}
      {currentSong && (
        <div className="player">
          <div className="player-info">
            <h3>{currentSong.title}</h3>
            <p>{currentSong.artist}</p>
          </div>
          
          <div className="player-controls">
            <button onClick={handlePrevious}>
              <SkipBack size={20} />
            </button>
            <button onClick={togglePlay} className="play-btn">
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={handleNext}>
              <SkipForward size={20} />
            </button>
          </div>
          
          <div className="player-progress">
            <span>{formatTime(currentTime)}</span>
            <div className="progress-bar" onClick={handleSeek}>
              <div 
                className="progress-fill" 
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
          
          <div className="player-extra">
            <button 
              onClick={() => setShuffle(!shuffle)}
              className={shuffle ? 'active' : ''}
            >
              <Shuffle size={20} />
            </button>
            <button 
              onClick={() => setLoop(loop === 'none' ? 'all' : loop === 'all' ? 'one' : 'none')}
              className={loop !== 'none' ? 'active' : ''}
            >
              <Repeat size={20} />
            </button>
            <div className="volume-control">
              <Volume2 size={20} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App = (props) => {
  return (
    <PlaybackProvider>
      <QueueProvider>
        <PlaylistProvider>
          <PlayRequestProvider>
            <Player roomCode={props.roomCode} token={props.token} isHost={props.isHost} />
            <InnerApp {...props} />
          </PlayRequestProvider>
        </PlaylistProvider>
      </QueueProvider>
    </PlaybackProvider>
  );
};

export default App;