import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { MusicService } from '../services/MusicService';
import './roomsongs.css';

// Helper: generate a stable device-song id from file metadata
const makeDeviceSongId = (file) => `device-${file.name}-${file.size}-${file.lastModified}`;

// Helper: resolve the best playable URL for a song object
const resolveSongUrl = (song) => {
  if (!song) return null;
  // MediaStore/Capacitor native song
  if (song.contentUri) return Capacitor.convertFileSrc(song.contentUri);
  // Blob URL from manual file pick
  if (song.source === 'device' && song.url) return song.url;
  // Uploaded song
  if (song._id) return `${import.meta.env.VITE_BACKEND_URL}/api/songs/${song._id}/stream`;
  return null;
};

const API_BASE = import.meta.env.VITE_BACKEND_URL;
const API_ROOMS = `${API_BASE}/api/rooms`;
const API_SONGS = `${API_BASE}/api/songs`;
const SOCKET_URL = API_BASE;

const Room = ({ roomCode, onLeaveRoom, userId }) => {
  const token = localStorage.getItem('token');

  // Room and UI states
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [loadingRoom, setLoadingRoom] = useState(true);

  // All songs from DB for adding to queue or direct play
  const [allSongs, setAllSongs] = useState([]);
  const [allSongsLoading, setAllSongsLoading] = useState(false);
  const [allSongsError, setAllSongsError] = useState('');

  // Playback and queue states
  const [queue, setQueue] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentDuration, setCurrentDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Real-time sync states
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(0);
  const [expectedTimeAtSync, setExpectedTimeAtSync] = useState(0);

  // Users and host state
  const [users, setUsers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  // Reconnection overlay state
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Guest-local pause: when true, only this guest's audio is paused locally.
  // The room keeps playing. On resume the guest re-syncs to the live position.
  const [guestPaused, setGuestPaused] = useState(false);
  const guestPausedRef = useRef(false);

  // allow guests to enable playback (user gesture) so audio.play() won't be blocked
  const [playbackEnabled, setPlaybackEnabled] = useState(false);
  // Guest volume (independent of host)
  const [guestVolume, setGuestVolume] = useState(1);

  // Device songs state (local files picked by host)
  const [deviceSongs, setDeviceSongs] = useState([]);
  const [songTab, setSongTab] = useState('uploaded'); // 'uploaded' | 'device'
  const deviceFileInputRef = useRef(null);

  const allSongsRef = useRef(allSongs);
  const isHostRef = useRef(isHost);
  const audioRef = useRef(null);
  const audioPendingRef = useRef({ src: null, listener: null });
  const playedStackRef = useRef([]);
  const socketRef = useRef(null);
  const initialLoad = useRef(true);
  const lastGuestSyncRef = useRef(0); // Track last sync time for guests
  // Holds the latency-compensated target time from the most recent socket playback event.
  // Used by the guest audio effect to start the audio at the correct position
  // (avoids starting at 0 due to React state being async when song src changes).
  const pendingSeekTimeRef = useRef(null);

  // On mount: load cached room/songs immediately, then refresh in background
  useEffect(() => {
    // Load cached data for instant display
    try {
      const cachedRoom = sessionStorage.getItem(`room_${roomCode}`);
      const cachedSongs = sessionStorage.getItem('rs_songs_v1');
      const cachedQueue = sessionStorage.getItem(`room_${roomCode}_queue`);
      const savedPosition = sessionStorage.getItem(`room_${roomCode}_position`);
      if (cachedRoom) {
        const parsed = JSON.parse(cachedRoom);
        setRoom(parsed);
        setUsers(parsed.users || []);
        setIsHost(!!(parsed.host && parsed.host._id === userId));
        // Ensure currentSong has required fields, even if cached data is incomplete
        const currentSongData = parsed.currentSong;
        if (currentSongData && currentSongData._id) {
          // Make sure title and artist exist
          setCurrentSong({
            _id: currentSongData._id,
            title: currentSongData.title || '(no title)',
            artist: currentSongData.artist || '(no artist)',
            ...currentSongData // Include any other fields
          });
        } else {
          setCurrentSong(null);
        }
        // Restore saved position if available (more recent than cached room)
        const savedTime = savedPosition ? parseFloat(savedPosition) : null;
        setCurrentTime(savedTime !== null ? savedTime : (parsed.currentTime || 0));
        setIsPlaying(parsed.isPlaying || false);
        // Restore queue from cache
        if (cachedQueue) {
          try {
            setQueue(JSON.parse(cachedQueue));
          } catch (e) {
            setQueue(parsed.queue || []);
          }
        } else {
          setQueue(parsed.queue || []);
        }
        setLoadingRoom(false);
        initialLoad.current = false;
      }
      if (cachedSongs) setAllSongs(JSON.parse(cachedSongs));
    } catch (e) {}
  }, [roomCode, userId]);

  // Persist audio position every 2 seconds (for resume on refresh)
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;
    const interval = setInterval(() => {
      try {
        const pos = audioRef.current.currentTime;
        if (pos > 0) {
          sessionStorage.setItem(`room_${roomCode}_position`, pos.toString());
        }
      } catch (e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [currentSong, roomCode]);

  // Initialize audio player when currentSong loads from cache (on mount)
  // This ensures audio resumes after page refresh
  useEffect(() => {
    if (!currentSong || !currentSong._id) return;
    if (!audioRef.current) return;
    
    // Only run once on initial mount (when loadingRoom transitions to false)
    if (loadingRoom) return;
    
    const audio = audioRef.current;
    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;
    
    // Check if audio already has this src loaded
    if (audio.src && String(audio.src).includes(currentSong._id)) {
      return; // Already loaded
    }

    // Apply audio src to initialize playback
    try {
      audio.crossOrigin = 'anonymous';
      audio.preload = 'metadata';
      audio.src = streamUrl;
      audio.load();
      
      // Don't auto-play - wait for user to click Play
      if (isPlaying && !isHost) {
        audio.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Error initializing audio on mount:', e);
    }
  }, [currentSong, loadingRoom, isHost, isPlaying]);

  // Fetch room info on mount & poll (avoid loading flicker on every poll)
  useEffect(() => {
	let mounted = true;
	let backoff = 2000; // initial delay 2s
	const MAX_BACKOFF = 60000; // cap 1 minute
	let timer = null;

	const schedule = (delay) => {
		if (!mounted) return;
		timer = setTimeout(runFetchRoom, delay);
	};

	const runFetchRoom = async () => {
		if (!mounted) return;

		// If offline, increase backoff and reschedule
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			console.warn('Offline - skipping room fetch');
			backoff = Math.min(MAX_BACKOFF, backoff * 2);
			schedule(backoff);
			return;
		}

		if (initialLoad.current) setLoadingRoom(true);
		setError('');
		try {
			const res = await fetch(`${API_ROOMS}/${roomCode}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || `Room fetch failed: ${res.status}`);
			}
			const data = await res.json();

			// Cache room data for instant reload
			try { sessionStorage.setItem(`room_${roomCode}`, JSON.stringify(data)); } catch (e) {}

			// Apply server playback with real-time sync
			const applyServerPlayback = (server) => {
				// update static room/users info (safe)
				setRoom(server);
				setUsers(server.users || []);
				setIsHost(!!(server.host && server.host._id === userId));

				// If this client is host, don't override host playback/queue
				if (server.host && server.host._id === userId) return;

				const serverSongId = server.currentSong?._id || server.currentSongId || null;
				const localSongId = currentSong?._id || null;

				// If the guest's current song is a device song (source === 'device'),
				// the REST response will always return currentSong=null (device IDs are not
				// stored as ObjectIds in MongoDB). Trust the socket state in that case.
				const localIsDeviceSong = currentSong?.source === 'device';

				if (serverSongId !== localSongId && !localIsDeviceSong) {
					if (serverSongId) {
						const found = allSongs.find(s => s._id === serverSongId);
						const songData = found || server.currentSong || { _id: serverSongId };
						// Ensure title and artist exist
						setCurrentSong({
							_id: songData._id,
							title: songData.title || '(no title)',
							artist: songData.artist || '(no artist)',
							...songData
						});
					} else {
						setCurrentSong(null);
					}
				}

				// REAL-TIME SYNC: Calculate expected playback time based on server timestamp
				const now = Date.now();
				const syncTimestamp = server.syncTimestamp || 0;
				const expectedServerTime = server.currentTime || 0;
				
				// Store sync info for guest sync calculations
				if (syncTimestamp > 0) {
					setLastSyncTimestamp(syncTimestamp);
					setExpectedTimeAtSync(expectedServerTime);
				}

				// For guests: calculate expected time based on when server state was recorded
				let targetTime = expectedServerTime;
				if (syncTimestamp > 0 && server.isPlaying) {
					const timeSinceSyncMs = now - syncTimestamp;
					const timeSinceSyncSec = timeSinceSyncMs / 1000;
					// Add elapsed time since the sync was recorded
					targetTime = expectedServerTime + timeSinceSyncSec;
				}

				if (audioRef.current) {
					const audioTime = audioRef.current.currentTime || 0;
					const drift = Math.abs(audioTime - targetTime);
					
					// Only correct time on the very first fetch (initialLoad).
					// After that, the socket is the real-time sync channel.
					// Correcting on every REST poll (every 1.5 s) forces the browser to
					// discard its buffer and re-download, causing the stuttering/breaking sound.
					if (initialLoad.current) {
						try { 
							audioRef.current.currentTime = targetTime;
							setCurrentTime(targetTime);
							lastGuestSyncRef.current = now;
						} catch (e) {}
					}
				} else {
					setCurrentTime(targetTime);
				}

				if (typeof server.isPlaying === 'boolean' && server.isPlaying !== isPlaying) {
					setIsPlaying(server.isPlaying);
				}

				if (Array.isArray(server.queue)) {
					const serverQueueIds = server.queue.map(q => (typeof q === 'string' ? q : q._id));
					const localQueueIds = queue.map(q => q._id || q);
					if (JSON.stringify(serverQueueIds) !== JSON.stringify(localQueueIds)) {
						// If server queue has full objects, use them; otherwise look them up
						let mapped;
						if (typeof server.queue[0] === 'object' && server.queue[0]?.title) {
							// Server sent full objects with metadata
							mapped = server.queue;
						} else {
							// Server only sent IDs, look them up in allSongs
							mapped = serverQueueIds.map(id => allSongs.find(s => s._id === id) || { _id: id, title: '(unknown)', artist: '' });
						}
						setQueue(mapped);
						// Cache the queue for persistence across refreshes
						try { sessionStorage.setItem(`room_${roomCode}_queue`, JSON.stringify(mapped)); } catch (e) {}
					}
				}
			};

			applyServerPlayback(data);

			// success -> reset backoff for next poll (guests poll more frequently for better sync)
			backoff = isHost ? 5000 : 1500; // guests: 1.5s, host: 5s
		} catch (err) {
			console.warn('fetchRoom error:', err);
			// Surface user-friendly message (keeps UI recoverable)
			setError(err.message || 'Failed to load room');
			// increase backoff to avoid noisy retries
			backoff = Math.min(MAX_BACKOFF, backoff * 2);
		} finally {
			if (initialLoad.current) {
				setLoadingRoom(false);
				initialLoad.current = false;
			}
			// schedule next poll according to role/backoff
			schedule(backoff);
		}
	};

	// start immediately
	schedule(0);

	return () => {
		mounted = false;
		if (timer) clearTimeout(timer);
	};
}, [roomCode, token, userId]);

  // Keep allSongs and isHost in sync with refs for socket handlers
  useEffect(() => {
    allSongsRef.current = allSongs;
    isHostRef.current = isHost;
  }, [allSongs, isHost]);

  // Keep guestPausedRef in sync so async callbacks (intervals, socket handlers)
  // can read the latest value without stale closures.
  useEffect(() => { guestPausedRef.current = guestPaused; }, [guestPaused]);

  // Socket: join room and listen for host playback
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    // Optimize reconnection: prefer websocket, reduce timeout
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 5000,
    });

    socketRef.current.on('connect', () => {
      setIsReconnecting(false);
      socketRef.current.emit('joinRoom', roomCode);
      // register this client's userId with the server so host can target this user
      if (userId) socketRef.current.emit('registerUser', userId);
    });

    socketRef.current.on('disconnect', () => {
      setIsReconnecting(true);
    });

    socketRef.current.on('reconnect', () => {
      setIsReconnecting(false);
      // Re-join room after reconnect
      socketRef.current.emit('joinRoom', roomCode);
      if (userId) socketRef.current.emit('registerUser', userId);
    });

    // Server can force this client to leave the room (host kicked)
    socketRef.current.on('forceLeave', (data) => {
      const { roomCode: kickedFrom } = data || {};
      if (kickedFrom && kickedFrom !== roomCode) return;
      try { localStorage.removeItem('joinedRoomCode'); } catch (e) {}
      alert('You have been removed from the room by the host.');
      if (typeof onLeaveRoom === 'function') onLeaveRoom();
    });

    socketRef.current.on('playback', (playback) => {
      if (!playback) return;
      if (isHostRef.current) return;

      // REAL-TIME SYNC: Calculate latency-compensated target time FIRST (before any state updates)
      const now = Date.now();
      const syncTimestamp = playback.serverTime || now;
      const expectedTime = typeof playback.currentTime === 'number' ? playback.currentTime : 0;

      // Store sync reference (for continuous drift correction)
      setLastSyncTimestamp(syncTimestamp);
      setExpectedTimeAtSync(expectedTime);

      // Calculate expected time accounting for network latency
      let targetTime = expectedTime;
      if (playback.isPlaying && syncTimestamp) {
        const timeSinceSyncMs = now - syncTimestamp;
        const timeSinceSyncSec = Math.max(0, timeSinceSyncMs / 1000);
        targetTime = expectedTime + timeSinceSyncSec;
      }

      // Store the correct target time in a ref so the guest audio useEffect
      // can use it immediately when loading a new song src.
      // (React state updates are async, so setCurrentTime alone isn't enough
      //  when the song src also changes in the same render cycle.)
      pendingSeekTimeRef.current = targetTime;

      // Determine if this event changes the current song
      const incomingSongId = playback.currentSong?._id || playback.currentSongId || null;
      const currentAudioSrc = audioRef.current?.src || '';
      const srcAlreadyLoaded = incomingSongId && currentAudioSrc.includes(incomingSongId);

      // Update song state — compare by _id first so we don't create a new object
      // reference every 300ms (host tick rate). A new reference causes `currentSong`
      // state to change on every socket event, which re-runs the guest audio effect
      // every 300ms and calls audio.play() — that's what breaks the audio and overrides
      // the guest pause button.
      const incomingSong = playback.currentSong || null;
      const incomingId = incomingSong?._id || playback.currentSongId || null;

      // Only mutate currentSong state when the song ID actually changes
      setCurrentSong(prev => {
        const prevId = prev?._id || null;
        if (prevId === incomingId) return prev; // same song — keep same reference
        if (incomingId === null) {
          pendingSeekTimeRef.current = null;
          return null;
        }
        if (incomingSong) return incomingSong;
        const found = allSongsRef.current.find(s => s._id === incomingId);
        return found || { _id: incomingId };
      });

      // If the audio src is already loaded for this song, seek directly now
      // (the useEffect won't trigger a reload, so we must seek here)
      if (srcAlreadyLoaded && audioRef.current) {
        // Only correct significant drift (>3 s) to avoid constant re-buffering.
        // Also skip if the guest has personally paused their local audio.
        if (!guestPausedRef.current) {
          const audioTime = audioRef.current.currentTime || 0;
          const drift = Math.abs(audioTime - targetTime);
          if (drift > 3.0) {
            try {
              audioRef.current.currentTime = targetTime;
              lastGuestSyncRef.current = now;
            } catch (e) {}
          }
        }
        pendingSeekTimeRef.current = null; // consumed
      }

      // Do NOT update currentTime state from socket — it fights audio's onTimeUpdate
      // and causes the progress bar to jump/fluctuate constantly. The sync refs
      // (lastSyncTimestamp + expectedTimeAtSync) are enough for drift correction.
      // currentTime state is kept accurate by onTimeUpdate from the audio element.

      // Only update isPlaying state when value actually changes (React deduplicates
      // primitives, but being explicit makes the intent clear)
      if (typeof playback.isPlaying === 'boolean') setIsPlaying(playback.isPlaying);

      if (Array.isArray(playback.queue)) {
        // Serialise to compare — skip state update when queue content hasn't changed
        const newQIds = playback.queue.map(q => (typeof q === 'string' ? q : q._id)).join(',');
        setQueue(prev => {
          const prevIds = prev.map(q => q._id || q).join(',');
          if (prevIds === newQIds) return prev; // no change
          const mapped = playback.queue.map(q => {
            if (typeof q === 'string') {
              return allSongsRef.current.find(s => s._id === q) || { _id: q, title: '(unknown)', artist: '' };
            }
            if (q._id && (q.title || q.artist)) return q;
            const found = allSongsRef.current.find(s => s._id === q._id);
            return found || { _id: q._id, title: q.title || '(unknown)', artist: q.artist || '' };
          });
          try { sessionStorage.setItem(`room_${roomCode}_queue`, JSON.stringify(mapped)); } catch (e) {}
          return mapped;
        });
      }
    });

    return () => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('leaveRoom', roomCode);
        socketRef.current.disconnect();
      }
    };
    // Don't include allSongs, isHost to prevent infinite loop - use refs instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userId, onLeaveRoom]);

  // Load cached songs and refresh
  useEffect(() => {
    const cached = sessionStorage.getItem('rs_songs_v1');
    if (cached) {
      try { setAllSongs(JSON.parse(cached)); } catch (e) {}
    }
    refreshAllSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAllSongs = async () => {
    setAllSongsLoading(true);
    setAllSongsError('');
    const controller = new AbortController();
    try {
      const res = await fetch(API_SONGS, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to fetch songs: ${res.status}`);
      const data = await res.json();
      setAllSongs(data);
      try { sessionStorage.setItem('rs_songs_v1', JSON.stringify(data)); } catch (e) {}
    } catch (err) {
      console.warn('refreshAllSongs error', err);
      setAllSongsError(err.message || 'Error fetching songs');
    } finally {
      setAllSongsLoading(false);
    }
  };

  // Remove stale localStorage restore — MediaStore auto-loads on every mount
  // (localStorage is still written for metadata display, but blob URLs are gone on refresh)

  // Persist device song metadata to localStorage (no url/file - not serialisable)
  useEffect(() => {
    if (deviceSongs.length > 0) {
      const meta = deviceSongs.map(({ id, title, artist, album, duration }) => ({ id, title, artist, album, duration }));
      try { localStorage.setItem('room_device_songs_meta', JSON.stringify(meta)); } catch (e) {}
    }
  }, [deviceSongs]);

  // ===== DEVICE SONGS: Auto-load from MediaStore (same as OfflineMusicPlayer) =====
  const [deviceSongsLoading, setDeviceSongsLoading] = useState(false);
  const [deviceSongsError, setDeviceSongsError] = useState('');

  // Auto-fetch device songs on mount using the Capacitor MediaStore plugin
  useEffect(() => {
    const loadDeviceSongs = async () => {
      setDeviceSongsLoading(true);
      setDeviceSongsError('');
      try {
        const permissionGranted = await MusicService.requestPermission();
        if (!permissionGranted) {
          setDeviceSongsError('Permission denied. Allow storage access to load device songs.');
          setDeviceSongsLoading(false);
          return;
        }
        const songs = await MusicService.getSongs();
        if (songs.length === 0) {
          setDeviceSongsError('No songs found on device.');
        } else {
          // Map to our internal format, tagging as device source
          setDeviceSongs(songs.map(s => ({
            id: `device-${s.id}`,
            _id: undefined,
            title: s.title,
            artist: s.artist,
            album: s.album,
            duration: s.duration,
            contentUri: s.contentUri,
            source: 'device',
            needsReload: false,
          })));
        }
      } catch (err) {
        console.warn('MediaStore load error (expected on web/desktop):', err.message);
        // Not an error on web — plugin only works on native Android/iOS
        // Fall back to manual file pick (toolbar button)
      } finally {
        setDeviceSongsLoading(false);
      }
    };
    loadDeviceSongs();
  }, []);

  // Handle host picking local audio files inside the room (web fallback)
  const handleDeviceFileInput = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
    if (!files.length) return;
    const songs = files.map(file => ({
      id: makeDeviceSongId(file),
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Device',
      album: 'Device Music',
      duration: 0,
      source: 'device',
      url: URL.createObjectURL(file),
      file,
      needsReload: false,
    }));
    setDeviceSongs(prev => {
      // Merge: replace any stale entries with fresh urls
      const merged = [...prev];
      songs.forEach(s => {
        const idx = merged.findIndex(x => x.id === s.id);
        if (idx >= 0) merged[idx] = s;
        else merged.push(s);
      });
      return merged;
    });
    // Switch to device tab automatically
    setSongTab('device');
    // reset input so user can re-pick the same files
    e.target.value = '';
  };

  const groupedByAlbum = React.useMemo(() => {
    return (allSongs || []).reduce((acc, s) => {
      const a = (s.album || '').trim() || 'Uncategorized';
      (acc[a] = acc[a] || []).push(s);
      return acc;
    }, {});
  }, [allSongs]);

  const [albumExpanded, setAlbumExpanded] = useState({});

  // Host pushes playback updates - FREQUENT for real-time sync
  useEffect(() => {
    if (!isHost) return;
    let mounted = true;
    let backoff = 300; // Fast initial sync: 300ms (was 2000ms)
    const MAX_BACKOFF = 60000;
    let throttleCount = 0; // Throttle REST calls while keeping socket fast

    const schedule = (delay) => {
      if (!mounted) return;
      return setTimeout(runTick, delay);
    };

    const runTick = async () => {
      if (!mounted) return;
      if (!room) {
        backoff = 300;
        timer = schedule(backoff);
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn('Navigator offline - skipping playback persist');
        backoff = Math.min(MAX_BACKOFF, backoff * 2);
        timer = schedule(backoff);
        return;
      }

      const serverTime = Date.now();
      // For device songs, use song.id (not _id which is undefined)
      const songId = currentSong ? (currentSong._id || currentSong.id || null) : null;
      const payload = {
        currentSongId: songId,
        currentSong: currentSong ? {
          _id: songId,
          title: currentSong.title,
          artist: currentSong.artist,
          source: currentSong.source || 'uploaded',
          // Don't send contentUri/url in payload — guests can't use it
        } : null,
        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
        isPlaying,
        queue: buildQueuePayload(queue),
        serverTime,
      };

      // Send via Socket.io EVERY update (fast, real-time)
      try {
        socketRef.current?.emit('hostPlayback', { roomCode, playback: { ...payload, serverTime } });
      } catch (e) {
        console.warn('Socket emit error', e);
      }

      // Only send REST update occasionally (every 3rd tick) to save bandwidth
      throttleCount++;
      if (throttleCount >= 3) {
        throttleCount = 0;
        try {
          const res = await fetch(`${API_ROOMS}/${roomCode}/playback`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            console.warn('Playback persist returned', res.status);
          }
        } catch (e) {
          console.warn('REST playback update failed', e);
        }
      }

      // Always use fast sync interval for host
      backoff = 300; // Stay at 300ms for real-time feel
      timer = schedule(backoff);
    };

    let timer = schedule(0);
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, currentSong, isPlaying, queue, room, roomCode, token]);

  // Guests sync their audio player to host playback state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isHost) return; // host controls local player

    if (!currentSong) {
      audio.pause();
      try { audio.removeAttribute('src'); audio.load(); setCurrentDuration(0); } catch (e) {}
      // Clear saved position when no song
      try { sessionStorage.removeItem(`room_${roomCode}_position`); } catch (e) {}
      return;
    }

    // Device songs are local to host — guests can't stream them
    if (currentSong.source === 'device') {
      audio.pause();
      try { audio.removeAttribute('src'); audio.load(); setCurrentDuration(0); } catch (e) {}
      return;
    }

    const streamUrl = `${API_SONGS}/${currentSong._id}/stream`;

    // set crossOrigin and preload so metadata and range requests work reliably
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';

    // compare by id to avoid absolute/relative URL differences
    const srcIncludesId = audio.src && String(audio.src).includes(currentSong._id);
    if (!srcIncludesId) {
      // New song src — auto-resume guest-local pause so they hear the new track.
      if (guestPausedRef.current) {
        setGuestPaused(false);
        guestPausedRef.current = false;
      }
      // Priority order for resume time:
      // 1. pendingSeekTimeRef — latency-compensated time from the most recent socket
      //    playback event (most accurate, avoids React state async delay)
      // 2. sessionStorage saved position (for page refresh resume)
      // 3. currentTime state (fallback)
      let resumeTime;
      if (pendingSeekTimeRef.current !== null) {
        resumeTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null; // consume it
      } else {
        const savedPos = sessionStorage.getItem(`room_${roomCode}_position`);
        resumeTime = savedPos ? parseFloat(savedPos) : currentTime;
      }
      // ensure audio element can load even if controls hidden
      audio.style.width = '100%';
      audio.style.height = '1px';
      // delegate src/load/play handling to helper to avoid race conditions
      applyAudioSrc(streamUrl, isPlaying && playbackEnabled && !guestPausedRef.current, resumeTime);
      return;
    }


    const trySyncTime = () => {
      try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
      // Only correct drift >3 s — smaller corrections interrupt buffering and cause pops/clicks
      if (!Number.isNaN(currentTime) && Math.abs(audio.currentTime - currentTime) > 3) {
        try { audio.currentTime = currentTime; } catch (e) {}
      }
      if (isPlaying && !guestPausedRef.current) audio.play().catch(() => {});
      else audio.pause();
    };

    if (isNaN(audio.duration) || audio.duration === 0) {
      const onLoadedMeta = () => {
        try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
        trySyncTime();
        audio.removeEventListener('loadedmetadata', onLoadedMeta);
      };
      audio.addEventListener('loadedmetadata', onLoadedMeta);
    } else {
      trySyncTime();
    }
  }, [currentSong, isPlaying, isHost, playbackEnabled]);

  // Guest continuous sync correction - keep correcting drift but less aggressively
  useEffect(() => {
    if (isHost) return;
    if (!audioRef.current) return;
    if (!currentSong || !isPlaying) return;
    
    let mounted = true;
    const interval = setInterval(() => {
      if (!mounted) return;
      // Don't correct while guest has locally paused — they re-sync when they resume
      if (guestPausedRef.current) return;
      const audio = audioRef.current;
      if (!audio || !audio.src) return;
      
      // Calculate expected time based on last sync
      const now = Date.now();
      const expectedServerTime = expectedTimeAtSync || 0;
      let targetTime = expectedServerTime;
      
      if (lastSyncTimestamp > 0 && isPlaying) {
        const timeSinceSyncMs = now - lastSyncTimestamp;
        const timeSinceSyncSec = timeSinceSyncMs / 1000;
        targetTime = expectedServerTime + timeSinceSyncSec;
      }
      
      const audioTime = audio.currentTime || 0;
      const drift = Math.abs(audioTime - targetTime);
      
      // Only correct SIGNIFICANT drift (>3 seconds) to avoid constant seeking that breaks audio.
      // Drifts under 3 s are not noticeable; frequent corrections force re-buffering (stuttering).
      if (drift > 3.0) {
        try {
          audio.currentTime = targetTime;
          setCurrentTime(targetTime);
        } catch (e) {}
      }
    }, 5000); // Check every 5 s — frequent corrections disrupt buffering and cause audio breaks
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isHost, currentSong, isPlaying, lastSyncTimestamp, expectedTimeAtSync]);

  // Host's local audio player — uses resolveSongUrl to handle MediaStore, blob, and stream URLs
  useEffect(() => {
    if (!isHost) return;
    if (!audioRef.current) return;

    if (!currentSong) {
      audioRef.current.pause();
      try { audioRef.current.removeAttribute('src'); audioRef.current.load(); setCurrentDuration(0); } catch (e) {}
      return;
    }

    // Resolve the correct URL: contentUri (Capacitor), blob URL, or stream URL
    const streamUrl = resolveSongUrl(currentSong);
    if (!streamUrl) {
      console.warn('No playable URL for song:', currentSong.title, '— ContentUri missing or device blob expired');
      return;
    }

    // Identify the song: use id (device) or _id (uploaded)
    const songIdentifier = currentSong.source === 'device' ? currentSong.id : currentSong._id;
    const srcIncludesId = audioRef.current.src && songIdentifier && String(audioRef.current.src).includes(String(songIdentifier));
    if (!srcIncludesId) {
      applyAudioSrc(streamUrl, isPlaying);
    }

    const onLoadedMetaHost = () => {
      try { if (typeof audioRef.current.duration === 'number' && !Number.isNaN(audioRef.current.duration)) setCurrentDuration(audioRef.current.duration); } catch (e) {}
      audioRef.current.removeEventListener('loadedmetadata', onLoadedMetaHost);
    };
    audioRef.current.addEventListener('loadedmetadata', onLoadedMetaHost);

    if (!Number.isNaN(currentTime) && currentTime > 0 && audioRef.current.duration && currentTime < audioRef.current.duration) {
      try { audioRef.current.currentTime = currentTime; } catch (e) {}
    }
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isHost, currentSong, isPlaying]);

  // Helper: emit playback state via socket
  const emitHostPlayback = (payload) => {
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('hostPlayback', { roomCode, playback: payload });
      }
    } catch (e) {
      console.warn('Socket emit error:', e);
    }
  };

  // Helper: persist playback state to server
  const persistPlayback = (payload) => {
    if (!isHost) return;
    try {
      fetch(`${API_ROOMS}/${roomCode}/playback`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      }).catch(e => console.warn('Playback persist error:', e));
    } catch (e) {
      console.warn('Persist playback error:', e);
    }
  };

  // Host adds a song to the queue
  const addSongToQueue = (song) => {
    if (!isHost) return;
    console.debug('addSongToQueue', song._id || song.id);
    setQueue(prev => {
      if (currentSong && currentSong._id) {
        playedStackRef.current.push(currentSong);
      }
      const newQ = [...prev, song];
      // Cache queue in sessionStorage so it persists across refreshes
      try {
        sessionStorage.setItem(`room_${roomCode}_queue`, JSON.stringify(newQ));
      } catch (e) {}
       if (!currentSong) {
         setCurrentSong(song);
         setIsPlaying(true);
         if (audioRef.current) {
           const audioUrl = song.source === 'device' ? song.url : `${API_SONGS}/${song._id}/stream`;
           if (audioUrl) applyAudioSrc(audioUrl, true);
         }
         const payload = {
           currentSongId: song._id || song.id,
           currentSong: { _id: song._id || song.id, title: song.title, artist: song.artist, source: song.source || 'uploaded' },
           currentTime: 0,
           isPlaying: true,
           queue: newQ.map(s => ({ _id: s._id || s.id, title: s.title, artist: s.artist, source: s.source || 'uploaded' }))
         };
         emitHostPlayback(payload);
         persistPlayback(payload);
       } else {
         const payload = {
           currentSongId: currentSong?._id || null,
           currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist, source: currentSong.source || 'uploaded' } : null,
           currentTime: audioRef.current ? audioRef.current.currentTime : 0,
           isPlaying,
           queue: newQ.map(s => ({ _id: s._id || s.id, title: s.title, artist: s.artist, source: s.source || 'uploaded' }))
         };
         emitHostPlayback(payload);
         persistPlayback(payload);
       }
       return newQ;
     });
  };

  // Host toggles play/pause
  const togglePlayPause = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isHost) return;
    if (!audioRef.current) return;
    const newPlaying = !isPlaying;
    console.debug('togglePlayPause ->', newPlaying);
    if (newPlaying) {
      audioRef.current.crossOrigin = 'anonymous';
      audioRef.current.preload = 'metadata';
      audioRef.current.play().catch((err) => { console.warn('play blocked', err); });
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(newPlaying);
    const payload = {
      currentSongId: currentSong?._id || null,
      currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
      currentTime: audioRef.current ? audioRef.current.currentTime : 0,
      isPlaying: newPlaying,
      queue: buildQueuePayload(queue),
    };
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Guest toggles their own local audio — does NOT affect the room or other users.
  // On resume, audio seeks to the current live position so the guest rejoins in sync.
  const guestTogglePlayPause = () => {
    if (isHost) return; // guard — hosts use togglePlayPause
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentSong || currentSong.source === 'device') return;
    if (!playbackEnabled) return; // must tap "Listen Live" first

    if (guestPaused) {
      // Re-sync to the current live position before resuming
      const now = Date.now();
      let targetTime = expectedTimeAtSync || 0;
      if (lastSyncTimestamp > 0 && isPlaying) {
        const elapsed = Math.max(0, (now - lastSyncTimestamp) / 1000);
        targetTime = (expectedTimeAtSync || 0) + elapsed;
      }
      // Set ref immediately (before React schedules the state update) so any
      // socket/interval callback that fires in the same tick sees the new value.
      guestPausedRef.current = false;
      try { audio.currentTime = targetTime; } catch (e) {}
      audio.play().catch(() => {});
      setGuestPaused(false);
    } else {
      audio.pause();
      // Set ref immediately — don't wait for the useEffect to sync it.
      // The next socket event (arrives within 300ms) must see guestPaused=true
      // so it doesn't call audio.play() and override the pause.
      guestPausedRef.current = true;
      setGuestPaused(true);
    }
  };

  // When current song ends
  const handleEnded = () => {
    if (currentSong && currentSong._id) {
      playedStackRef.current.push(currentSong);
    }
    setQueue(prev => {
      if (prev.length <= 1) {
        setCurrentSong(null);
        setIsPlaying(false);
        const payload = { currentSongId: null, currentSong: null, currentTime: 0, isPlaying: false, queue: [] };
        emitHostPlayback(payload);
        persistPlayback(payload);
        return [];
      }
      const [, ...rest] = prev;
      const next = rest[0] || null;
      setCurrentSong(next);
      const payload = {
        currentSongId: next ? next._id : null,
        currentSong: next ? { _id: next._id, title: next.title, artist: next.artist } : null,
        currentTime: 0,
        isPlaying: true,
        queue: buildQueuePayload(rest)
      };
      emitHostPlayback(payload);
      persistPlayback(payload);
      return rest;
    });
  };

  // Update playback current time
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
  };

  // Update buffered and duration
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onProgress = () => {
      try {
        const buf = audio.buffered;
        if (buf && buf.length > 0) {
          const end = buf.end(buf.length - 1);
          setBufferedEnd(end || 0);
        }
      } catch (e) {
        // ignore
      }
    };

    const onLoadedMeta = () => {
      try {
        if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) {
          setCurrentDuration(audio.duration);
        }
      } catch (e) {}
    };

    audio.addEventListener('progress', onProgress);
    audio.addEventListener('loadedmetadata', onLoadedMeta);

    try { if (audio.duration && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
    onProgress();

    return () => {
      try { audio.removeEventListener('progress', onProgress); } catch (e) {}
      try { audio.removeEventListener('loadedmetadata', onLoadedMeta); } catch (e) {}
      setBufferedEnd(0);
    };
  }, [currentSong, isHost, playbackEnabled]);

  // Remove user
  const removeUser = async (userIdToRemove) => {
    if (!isHost) return alert('Only host can remove users');
    if (userIdToRemove === userId) return alert('You cannot remove yourself');
    if (!window.confirm('Remove this user from the room?')) return;
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('kickUser', { userId: userIdToRemove, roomCode });
        setUsers(prev => prev.filter(u => u._id !== userIdToRemove));
        alert('Removal request sent to server.');
        return;
      }

      const res = await fetch(`${API_ROOMS}/${roomCode}/users`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: userIdToRemove }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to remove user');
      }
      setUsers(prev => prev.filter(u => u._id !== userIdToRemove));
      alert('User removed from the room');
    } catch (e) {
      alert(e.message || 'Error removing user');
    }
  };

  // Helper: resolve queue entry
  const resolveSongObj = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return allSongs.find(s => s._id === entry) || { _id: entry, title: '(unknown)', artist: '' };
    }
    if (entry._id && (entry.title || entry.artist)) return entry;
    if (entry._id) return allSongs.find(s => s._id === entry._id) || entry;
    return entry;
  };

  // Helper: build queue payload with full objects (includes title/artist)
  const buildQueuePayload = (q) => {
    return q.map(s => {
      if (typeof s === 'string') {
        return { _id: s, title: '(unknown)', artist: '' };
      }
      return { _id: s._id, title: s.title || '(unknown)', artist: s.artist || '' };
    });
  };

  // Host: play now
  const playNow = (song) => {
    if (!isHost) return;
    if (currentSong && currentSong._id) {
      playedStackRef.current.push(currentSong);
    }
    setQueue([]);
    setCurrentSong(song);
    setIsPlaying(true);
    if (audioRef.current) {
      // Device songs use their blob url; uploaded songs stream from backend
      const audioUrl = song.source === 'device' ? song.url : `${API_SONGS}/${song._id}/stream`;
      if (audioUrl) applyAudioSrc(audioUrl, true);
    }
    const payload = {
      currentSongId: song._id || song.id,
      currentSong: { _id: song._id || song.id, title: song.title, artist: song.artist, source: song.source || 'uploaded' },
      currentTime: 0,
      isPlaying: true,
      queue: [],
    };
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // tiny prefetch helper to warm connection and start preload
  const prefetchAudio = (url) => {
		try {
			const u = new URL(url);
			const origin = u.origin;
			const pc = document.createElement('link');
			pc.rel = 'preconnect';
			pc.href = origin;
			pc.crossOrigin = '';
			document.head.appendChild(pc);
			setTimeout(() => { try { document.head.removeChild(pc); } catch (e) {} }, 30000);
		} catch (e) {}
		try {
			const pl = document.createElement('link');
			pl.rel = 'preload';
			pl.as = 'audio';
			pl.href = url;
			document.head.appendChild(pl);
			setTimeout(() => { try { document.head.removeChild(pl); } catch (e) {} }, 30000);
		} catch (e) {}
	};

  // Helper to set audio src and play only after canplay to avoid races/AbortError
  function applyAudioSrc(url, shouldPlay = false, startTime = 0) {
    const audio = audioRef.current;
    if (!audio) return;

    // clear when no url requested
    if (!url) {
      try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
      audioPendingRef.current.src = null;
      if (audioPendingRef.current.listener) {
        try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
        audioPendingRef.current.listener = null;
      }
      return;
    }

    // if same source (or contains same identifier), just toggle play/pause
    try {
      if (audio.src && String(audio.src).includes(url)) {
        // If resuming, seek to saved position
        if (startTime > 0 && Math.abs(audio.currentTime - startTime) > 2) {
          try { audio.currentTime = startTime; } catch (e) {}
        }
        if (shouldPlay) audio.play().catch(() => {});
        else audio.pause();
        return;
      }
    } catch (e) { /* ignore */ }

    // remove any previous pending listener
    if (audioPendingRef.current.listener) {
      try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
      audioPendingRef.current.listener = null;
    }

    audioPendingRef.current.src = url;
    const onCanPlay = () => {
      // ensure this listener corresponds to the current pending src
      if (!audioPendingRef.current.src || !(String(audio.src).includes(audioPendingRef.current.src))) {
        try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
        audioPendingRef.current.listener = null;
        return;
      }
      // Seek to resume position before playing
      if (startTime > 0) {
        try { audio.currentTime = startTime; } catch (e) {}
      }
      if (shouldPlay) audio.play().catch(() => {});
      try { audio.removeEventListener('canplay', onCanPlay); } catch (e) {}
      audioPendingRef.current.listener = null;
    };

    audioPendingRef.current.listener = onCanPlay;
    audio.crossOrigin = 'anonymous';
    // 'auto' lets the browser buffer ahead, preventing stalls and audio breaking.
    audio.preload = 'auto';
    try {
      audio.removeAttribute('src');
      audio.src = url;
      audio.addEventListener('canplay', onCanPlay);
      audio.load();
    } catch (e) {
      console.warn('applyAudioSrc error', e);
    }
  }

  // Seek by offset
  const seekBy = (offsetSeconds) => {
    if (!isHost) {
      alert('Only host can seek playback in the room.');
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const duration = audio.duration || currentDuration || 0;
      let t = (audio.currentTime || 0) + offsetSeconds;
      if (t < 0) t = 0;
      if (duration && t > duration) t = duration - 0.1;
      audio.currentTime = t;
      setCurrentTime(t);
      const payload = {
        currentSongId: currentSong?._id || null,
        currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
        currentTime: t,
        isPlaying,
        queue: buildQueuePayload(queue),
      };
      emitHostPlayback(payload);
      persistPlayback(payload);
    } catch (e) {
      console.warn('seekBy error', e);
    }
  };
  
  // Play previous
  const playPrevious = () => {
    if (!isHost) {
      alert('Only host can change tracks in the room.');
      return;
    }
    const prev = playedStackRef.current.pop();
    if (!prev) {
      alert('No previous track in history.');
      return;
    }
    setCurrentSong(prev);
    setIsPlaying(true);
    if (audioRef.current) {
      applyAudioSrc(`${API_SONGS}/${prev._id}/stream`, true);
    }
    const payload = {
      currentSongId: prev._id,
      currentSong: { _id: prev._id, title: prev.title, artist: prev.artist },
      currentTime: 0,
      isPlaying: true,
      queue: queue.map(s => s._id || s),
    };
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Skip next
  const skipNext = () => {
    if (!isHost) { alert('Only host can skip to next track.'); return; }
    handleEnded();
  };
  
  // Render album block
  const renderAlbumBlock = (albumName, list) => {
    const LIMIT = 100;
    const expanded = !!albumExpanded[albumName];
    const visible = expanded ? list : list.slice(0, LIMIT);

    return (
      <div key={albumName} className="album-block">
        <h3>{albumName}</h3>
        <table className="album-table">
          <tbody>
            {visible.map(s => (
              <tr key={s._id}>
                <td>{s.title} - {s.artist}</td>
                <td>
                  {isHost ? (
                    <>
                      <button onClick={() => playNow(s)}>Play Now</button>
                      <button onClick={() => addSongToQueue(s)}>Add to Queue</button>
                    </>
                  ) : (
                    <button onClick={() => alert('Only host can add or play songs')} disabled>Host only</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > LIMIT && (
          <div className="album-show-more">
            <button onClick={() => setAlbumExpanded(prev => ({ ...prev, [albumName]: !prev[albumName] }))}>
              {expanded ? `Show less (${list.length})` : `Show more (${list.length - LIMIT})`}
            </button>
          </div>
        )}
      </div>
    );
  };

  // MAIN render
  if (loadingRoom) return <div className="loading">Loading room...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="room">
      {/* Reconnection overlay */}
      {isReconnecting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: '#fff',
          fontSize: 18,
          fontWeight: 'bold'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>🔄 Reconnecting...</div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>Please wait while we restore your connection</div>
          </div>
        </div>
      )}

      <h2>🎵 {room?.name || roomCode}</h2>
      <div className="room-info">
        <div>
          <strong>Host:</strong> {room?.host?.username || room?.host?.name || room?.host?.email || 'Unknown'}
          {room?.host?._id === userId && ' (You)'}
        </div>
        <div>
          <strong>👥 Users:</strong> {users.length}
        </div>
        <div>
          <strong>Status:</strong> {isHost ? 'Host' : 'Guest'}
        </div>
        <button 
          onClick={async () => {
            if (window.confirm('Are you sure you want to leave this room?')) {
              const token = localStorage.getItem('token');
              try {
                await fetch(`${API_ROOMS}/${roomCode}/leave`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                });
              } catch (err) {
                console.warn('Error leaving room:', err);
              }
              onLeaveRoom();
            }
          }}
        >
          🚪 Leave Room
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {/* Now Playing Section */}
      {currentSong && (
        <div className="playback-info">
          <div>
            🎶 Now Playing
            {currentSong.source === 'device' && <span className="device-badge" style={{ marginLeft: 6 }}>📱 Device Song</span>}
          </div>
          <div>{currentSong.title} — {currentSong.artist}</div>
          {/* Guest notice for device songs */}
          {!isHost && currentSong.source === 'device' && (
            <div className="device-guest-notice">
              📡 Host is playing a local device song — audio not available on your device
            </div>
          )}
          <div className="playback-progress-container">
            <div className="playback-progress-wrapper">
              <div className="playback-progress-bar">
                <div 
                  className="playback-progress-buffered"
                  style={{
                    width: currentDuration > 0 ? `${Math.min(100, (bufferedEnd / currentDuration) * 100)}%` : '0%'
                  }}
                />
                <div 
                  className="playback-progress-played"
                  style={{
                    width: currentDuration > 0 ? `${Math.min(100, (currentTime / currentDuration) * 100)}%` : '0%'
                  }}
                />
              </div>
              <div className="playback-progress-time">
                {formatTime(currentTime)} / {currentDuration ? formatTime(currentDuration) : '--:--'}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Playback Controls */}
      <div className="controls">
        <button onClick={playPrevious} disabled={!isHost} title="Previous Track">
          ⏮️ {isHost ? 'Prev' : 'Prev (Host only)'}
        </button>
        <button onClick={() => seekBy(-10)} disabled={!isHost} title="Rewind 10s">
          ⏪ {isHost ? '10s' : 'Rewind (Host only)'}
        </button>
        <button
          onClick={isHost ? togglePlayPause : guestTogglePlayPause}
          disabled={!isHost && !playbackEnabled}
          style={{ minWidth: '100px' }}
          title={
            !isHost && !playbackEnabled
              ? 'Tap "Listen Live" to enable audio first'
              : !isHost && guestPaused
              ? 'Click to rejoin the live stream at current position'
              : ''
          }
        >
          {isHost
            ? (isPlaying ? '⏸️ Pause' : '▶️ Play')
            : (guestPaused ? '▶️ Rejoin Live' : (isPlaying ? '⏸ Pause (me)' : '▶️ Play'))
          }
        </button>
        {!isHost && guestPaused && (
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 4, textAlign: 'center', gridColumn: '1 / -1' }}>
            ⏸ Your audio is paused locally — the room is still playing
          </div>
        )}
        <button onClick={() => seekBy(10)} disabled={!isHost} title="Forward 10s">
          {isHost ? '10s' : 'Forward (Host only)'} ⏩
        </button>
        <button onClick={skipNext} disabled={!isHost} title="Next Track">
          {isHost ? 'Next' : 'Next (Host only)'} ⏭️
        </button>
      </div>

      {!isHost && currentSong && currentSong.source !== 'device' && !playbackEnabled && (
        <div className="enable-playback-container">
          <button
            onClick={() => {
              setPlaybackEnabled(true);
              // Compute live position so audio starts in sync, not at 0
              const audio = audioRef.current;
              if (audio) {
                const now = Date.now();
                let targetTime = expectedTimeAtSync || 0;
                if (lastSyncTimestamp > 0 && isPlaying) {
                  const elapsed = Math.max(0, (now - lastSyncTimestamp) / 1000);
                  targetTime = (expectedTimeAtSync || 0) + elapsed;
                }
                if (targetTime > 0) {
                  try { audio.currentTime = targetTime; } catch (e) {}
                }
                audio.play().catch(() => {});
              }
            }}
          >
            🔊 Tap to Listen Live
          </button>
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>
            Browser requires a tap before playing audio
          </div>
        </div>
      )}

      {/* Guest volume control (shown once playback is enabled) */}
      {!isHost && playbackEnabled && currentSong && currentSong.source !== 'device' && (
        <div className="guest-volume-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
          <span>🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={guestVolume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setGuestVolume(v);
              if (audioRef.current) audioRef.current.volume = v;
            }}
            style={{ width: '120px' }}
          />
          <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{Math.round(guestVolume * 100)}%</span>
        </div>
      )}

      {/* Queue Section */}
      <div className="queue">
        <h3>📋 Queue ({queue.length} songs)</h3>
        {queue.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No songs in queue</p>
        ) : (
          <ul>
            {queue.map((entry, index) => {
              const s = resolveSongObj(entry);
              const idKey = s?._id || index;
              return (
                <li key={idKey}>
                  <span>{index + 1}. {(s?.title || '(unknown)')} - {(s?.artist || '')}</span>
                  {isHost && (
                    <button onClick={() => {
                      setQueue(prev => {
                        const newQ = prev.filter((_, i) => i !== index);
                        const payload = {
                          currentSongId: currentSong?._id || null,
                          currentSong: currentSong ? { _id: currentSong._id, title: currentSong.title, artist: currentSong.artist } : null,
                          currentTime: audioRef.current ? audioRef.current.currentTime : 0,
                          isPlaying,
                          queue: buildQueuePayload(newQ)
                        };
                        emitHostPlayback(payload);
                        persistPlayback(payload);
                        return newQ;
                      });
                    }}>Remove</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Songs Section */}
      <div className="songs">
        <div className="songs-header">
          <h3>🎵 Add Songs {isHost ? '(Host Controls)' : '(View Only)'}</h3>
          <div className="songs-tabs">
            <button
              className={`songs-tab ${songTab === 'uploaded' ? 'active' : ''}`}
              onClick={() => setSongTab('uploaded')}
            >
              ☁️ Uploaded ({allSongs.length})
            </button>
            <button
              className={`songs-tab ${songTab === 'device' ? 'active' : ''}`}
              onClick={() => setSongTab('device')}
            >
              📱 Device ({deviceSongs.length})
            </button>
          </div>
        </div>

        {/* Hidden file input for picking device songs */}
        <input
          ref={deviceFileInputRef}
          type="file"
          multiple
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleDeviceFileInput}
        />

        {/* Uploaded songs tab */}
        {songTab === 'uploaded' && (
          <>
            {allSongsLoading && <div className="loading">Loading songs...</div>}
            {allSongsError && <div className="error">{allSongsError}</div>}
            {Object.keys(groupedByAlbum).length > 0 ? (
              Object.keys(groupedByAlbum).map(albumName => renderAlbumBlock(albumName, groupedByAlbum[albumName]))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No uploaded songs available</div>
            )}
          </>
        )}

        {/* Device songs tab */}
        {songTab === 'device' && (
          <div className="device-songs-section">
            {/* Toolbar: auto-load status + manual fallback */}
            <div className="device-songs-toolbar">
              {deviceSongsLoading ? (
                <span className="device-loading">⏳ Loading device songs...</span>
              ) : deviceSongsError ? (
                <span className="device-reload-hint">⚠️ {deviceSongsError}</span>
              ) : deviceSongs.length > 0 ? (
                <span className="device-loaded-ok">✅ {deviceSongs.length} device songs loaded</span>
              ) : null}

              {/* Always show refresh/retry button */}
              {isHost && (
                <>
                  <button
                    className="load-device-btn"
                    onClick={async () => {
                      setDeviceSongsLoading(true);
                      setDeviceSongsError('');
                      try {
                        const granted = await MusicService.requestPermission();
                        if (!granted) { setDeviceSongsError('Permission denied.'); return; }
                        const songs = await MusicService.getSongs();
                        if (songs.length === 0) {
                          setDeviceSongsError('No songs found on device.');
                        } else {
                          setDeviceSongs(songs.map(s => ({
                            id: `device-${s.id}`,
                            _id: undefined,
                            title: s.title,
                            artist: s.artist,
                            album: s.album,
                            duration: s.duration,
                            contentUri: s.contentUri,
                            source: 'device',
                            needsReload: false,
                          })));
                        }
                      } catch (err) {
                        setDeviceSongsError('Plugin not available on web. Use file picker below.');
                      } finally {
                        setDeviceSongsLoading(false);
                      }
                    }}
                    disabled={deviceSongsLoading}
                  >
                    🔄 {deviceSongsLoading ? 'Loading...' : 'Refresh Device Songs'}
                  </button>

                  {/* Web fallback: manual file picker */}
                  <button
                    className="load-device-btn"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}
                    onClick={() => deviceFileInputRef.current && deviceFileInputRef.current.click()}
                  >
                    📂 Pick Files (Web)
                  </button>
                </>
              )}
            </div>

            {deviceSongs.length === 0 && !deviceSongsLoading ? (
              <div className="empty-device-songs">
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📱</div>
                <p>
                  {isHost
                    ? 'Device songs will load automatically from your phone. On web, use "Pick Files" to select audio files.'
                    : 'Host has not loaded any device songs yet.'}
                </p>
              </div>
            ) : (
              <div className="album-block">
                <h3>Device Music ({deviceSongs.length} songs)</h3>
                <table className="album-table">
                  <tbody>
                    {deviceSongs.map(s => (
                      <tr key={s.id}>
                        <td>
                          <span className="device-badge">📱</span>
                          {s.title}
                          <span style={{ color: '#94a3b8', fontSize: '0.8em', marginLeft: 6 }}>{s.artist}</span>
                        </td>
                        <td>
                          {isHost ? (
                            <>
                              <button onClick={() => playNow(s)}>Play Now</button>
                              <button onClick={() => addSongToQueue(s)}>Add to Queue</button>
                            </>
                          ) : (
                            <button disabled>Host only</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Host Controls */}
      {isHost && (
        <div className="host-controls">
          <h3>⚙️ Host Controls</h3>
          <button onClick={() => {
            const newName = prompt('Enter new room name', room.name);
            if (newName && newName !== room.name) {
              fetch(`${API_ROOMS}/${roomCode}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ name: newName }),
              })
                .then(res => res.json())
                .then(data => {
                  setRoom(data);
                  alert('Room name updated');
                })
                .catch(err => alert(err.message || 'Error updating room name'));
            }
          }}>📝 Change Room Name</button>
        </div>
      )}

      {/* User List */}
      <div className="user-list">
        <h3>👥 Users in Room ({users.length})</h3>
        <ul>
          {users.map(u => (
            <li key={u._id}>
              <span>
                {(u.username || u.name || u.email || u._id)} 
                {u._id === room?.host?._id && ' (Host)'} 
                {u._id === userId && ' (You)'}
              </span>
              {isHost && u._id !== userId && (
                <button onClick={() => removeUser(u._id)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        onEnded={handleEnded}
        controls={isHost}
        className={isHost ? '' : 'hidden-audio'}
      />
    </div>
  );
};

export default Room;

// Helper: format seconds -> mm:ss
function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '00:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}