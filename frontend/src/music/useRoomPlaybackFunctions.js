import {
  useState,
  useEffect,
  useRef,
  io,
  MusicService,
  API_ROOMS,
  API_SONGS,
  SOCKET_URL,
  makeDeviceSongId,
  resolveSongUrl,
  smoothSyncAudio,
  buildQueuePayload,
  resolveSongObj,
  formatTime,
} from './useRoomPlaybackImports';

export { formatTime } from './useRoomPlaybackImports';

/**
 * useRoomPlayback
 *
 * Owns every piece of state, every ref, every effect, and every handler
 * that drives a Room: fetching/polling room state, the socket connection,
 * host/guest playback sync, device songs, and queue management.
 *
 * Room.jsx should only consume the returned values/handlers and render UI —
 * it should not need to know how sync, sockets, or persistence work.
 */
export function useRoomPlayback(roomCode, onLeaveRoom, userId) {
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
  // This now PERSISTS across track changes too — a guest who paused stays
  // paused even if the host skips/changes the song, until they explicitly
  // tap "Rejoin Live".
  const [guestPaused, setGuestPaused] = useState(false);
  const guestPausedRef = useRef(false);

  // allow guests to enable playback (user gesture) so audio.play() won't be blocked
  const [playbackEnabled, setPlaybackEnabled] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  // Guest volume (independent of host)
  const [guestVolume, setGuestVolume] = useState(1);

  // Device songs state (local files picked by host)
  const [deviceSongs, setDeviceSongs] = useState([]);
  const [songTab, setSongTab] = useState('uploaded'); // 'uploaded' | 'device'
  const deviceFileInputRef = useRef(null);

  // Upload tracking state: maps contentUri to { status: 'uploading'|'done'|'error', progress: 0-100, message: '' }
  const [uploadingDeviceSongs, setUploadingDeviceSongs] = useState({});

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

  // Clock-offset compensation: the host's "serverTime" timestamp comes from the
  // HOST's own device clock, not a shared server clock. If a guest's device
  // clock differs from the host's by even a couple of seconds (very common —
  // phones/laptops drift without NTP), comparing `Date.now()` on the guest
  // directly against the host's timestamp produces a fake "drift" every tick,
  // which was causing constant hard-seeks (the breaking/refresh sound).
  //
  // Fix: calibrate a one-time offset between "my clock" and "their clock" the
  // first time we see a timestamp after connecting, then always read time
  // through that offset. This cancels out a constant clock difference. (For a
  // fully rigorous fix the offset should be computed server-side via a ping/
  // pong round-trip — ask me for the socket server file and I'll wire that up
  // too — but this client-side calibration removes the vast majority of the
  // false-drift seeking on its own.)
  const clockOffsetRef = useRef(null);

  const [albumExpanded, setAlbumExpanded] = useState({});

  // Device songs loading substates
  const [deviceSongsLoading, setDeviceSongsLoading] = useState(false);
  const [deviceSongsError, setDeviceSongsError] = useState('');

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
    if (!currentSong) return;
    if (!audioRef.current) return;

    // Only run once on initial mount (when loadingRoom transitions to false)
    if (loadingRoom) return;

    if (currentSong.source === 'device') return;

    const audio = audioRef.current;
    const songId = currentSong._id;
    if (!songId) return;
    const streamUrl = `${API_SONGS}/${songId}/stream`;

    // Check if audio already has this src loaded
    if (audio.src && String(audio.src).includes(songId)) {
      return; // Already loaded
    }

    // Apply audio src to initialize playback
    try {
      audio.crossOrigin = 'anonymous';
      audio.preload = 'metadata';
      audio.src = streamUrl;
      audio.load();

      // Don't auto-play - wait for user to click Play
      if (isPlaying && !isHost && !guestPausedRef.current) {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('Initial play error:', err.name);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Error initializing audio on mount:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

          const serverSongId = server.currentSong?._id || server.currentSong?.id || server.currentSongId || null;
          const localSongId = currentSong?._id || currentSong?.id || null;

          // If the guest's current song is a device song (source === 'device'),
          // the REST response will always return currentSong=null (device IDs are not
          // stored as ObjectIds in MongoDB). Trust the socket state in that case.
          const localIsDeviceSong = currentSong?.source === 'device';

          if (serverSongId !== localSongId && !localIsDeviceSong) {
            if (serverSongId) {
              const found = allSongs.find(s => s._id === serverSongId || s.id === serverSongId);
              const songData = found || server.currentSong || { _id: serverSongId, id: serverSongId };
              // Ensure title and artist exist
              setCurrentSong({
                _id: songData._id || songData.id || serverSongId,
                id: songData.id || songData._id || serverSongId,
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
    // NOTE: previously this created TWO socket connections in a row (the first
    // was immediately discarded/leaked without ever being disconnected, since
    // it was overwritten before any listeners were attached). That meant every
    // client silently held an extra, half-configured connection to the room —
    // wasted server resources and a source of flaky behavior. Only create one.
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 5000,
    });

    socketRef.current.on('connect', () => {
      setIsReconnecting(false);
      // Recalibrate clock offset after every fresh connection.
      clockOffsetRef.current = null;
      socketRef.current.emit('joinRoom', roomCode);
      // register this client's userId with the server so host can target this user
      if (userId) socketRef.current.emit('registerUser', userId);
    });

    socketRef.current.on('disconnect', () => {
      setIsReconnecting(true);
    });

    socketRef.current.on('reconnect', () => {
      setIsReconnecting(false);
      clockOffsetRef.current = null;
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
      const rawNow = Date.now();
      const syncTimestamp = playback.serverTime || rawNow;

      // Calibrate (once per connection) the offset between this guest's clock
      // and the host's clock that produced `syncTimestamp`. This cancels out
      // a constant clock difference between devices, instead of treating it
      // as real playback drift on every single tick.
      if (clockOffsetRef.current === null) {
        clockOffsetRef.current = rawNow - syncTimestamp;
      }
      const now = rawNow - clockOffsetRef.current;

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
      const incomingSongId = playback.currentSong?._id || playback.currentSong?.id || playback.currentSongId || null;
      const currentAudioSrc = audioRef.current?.src || '';
      const srcAlreadyLoaded = incomingSongId && currentAudioSrc.includes(incomingSongId);

      // Update song state — compare by _id first so we don't create a new object
      // reference every 300ms (host tick rate). A new reference causes `currentSong`
      // state to change on every socket event, which re-runs the guest audio effect
      // every 300ms and calls audio.play() — that's what breaks the audio and overrides
      // the guest pause button.
      const incomingSong = playback.currentSong || null;
      const incomingId = incomingSong?._id || incomingSong?.id || playback.currentSongId || null;

      // Only mutate currentSong state when the song ID actually changes
      setCurrentSong(prev => {
        const prevId = prev?._id || prev?.id || null;
        if (prevId === incomingId) return prev; // same song — keep same reference
        if (incomingId === null) {
          pendingSeekTimeRef.current = null;
          return null;
        }
        if (incomingSong) return incomingSong;
        const found = allSongsRef.current.find(s => s._id === incomingId || s.id === incomingId);
        return found || { _id: incomingId, id: incomingId };
      });

      // If the audio src is already loaded for this song, correct drift smoothly
      // (the useEffect won't trigger a reload, so we must sync here).
      // Skip entirely if the guest has personally paused their local audio —
      // their pause persists across host playback updates and track changes
      // until they explicitly tap "Rejoin Live".
      if (srcAlreadyLoaded && audioRef.current && !guestPausedRef.current) {
        smoothSyncAudio(audioRef.current, targetTime);
        lastGuestSyncRef.current = now;
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

  const normalizeSongText = (value) => String(value || '').trim().toLowerCase();
  const findMatchingUploadedSong = (song) => {
    if (!song || song.source !== 'device' || allSongs.length === 0) return null;
    const title = normalizeSongText(song.title);
    const artist = normalizeSongText(song.artist);
    const album = normalizeSongText(song.album);
    const duration = Number(song.duration) || 0;
    return allSongs.find((uploaded) => {
      if (!uploaded) return false;
      const sameTitle = normalizeSongText(uploaded.title) === title;
      const sameArtist = normalizeSongText(uploaded.artist) === artist;
      const sameDuration = Number(uploaded.duration) === duration;
      const uploadedAlbum = normalizeSongText(uploaded.album);
      const albumMatches = !album || !uploadedAlbum || uploadedAlbum === album;
      return sameTitle && sameArtist && sameDuration && albumMatches;
    });
  };

  const deleteUploadedSong = async (songId) => {
    if (!isHost) return;
    if (!songId) return;
    if (!window.confirm('Delete this uploaded song?')) return;

    try {
      const res = await fetch(`${API_SONGS}/${songId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to delete song: ${res.status}`);
      }

      const nextQueue = queue.filter((entry) => (entry?._id || entry?.id) !== songId);
      setAllSongs((prev) => prev.filter((s) => s._id !== songId));
      setQueue(nextQueue);

      if (currentSong && ((currentSong._id && currentSong._id === songId) || (currentSong.id && currentSong.id === songId))) {
        const nextSong = nextQueue[0] || null;
        setCurrentSong(nextSong);
        setIsPlaying(!!nextSong);
        const payload = buildPlaybackPayload({ currentSong: nextSong, currentTime: 0, isPlaying: !!nextSong, queue: nextQueue });
        emitHostPlayback(payload);
        persistPlayback(payload);
      }
    } catch (err) {
      console.error('deleteUploadedSong error:', err);
      setError(err.message || 'Failed to delete uploaded song');
    }
  };

  // Persist device song metadata to localStorage (no url/file - not serialisable)
  useEffect(() => {
    if (deviceSongs.length > 0) {
      const meta = deviceSongs.map(({ id, title, artist, album, duration }) => ({ id, title, artist, album, duration }));
      try { localStorage.setItem('room_device_songs_meta', JSON.stringify(meta)); } catch (e) {}
    }
  }, [deviceSongs]);

  // ===== DEVICE SONGS: load from MediaStore (shared by auto-load and manual refresh) =====
  const loadDeviceSongs = async () => {
    setDeviceSongsLoading(true);
    setDeviceSongsError('');
    try {
      const permissionGranted = await MusicService.requestPermission();
      if (!permissionGranted) {
        setDeviceSongsError('Permission denied. Allow storage access to load device songs.');
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
      setDeviceSongsError('Plugin not available on web. Use file picker below.');
    } finally {
      setDeviceSongsLoading(false);
    }
  };

  // Auto-fetch device songs on mount using the Capacitor MediaStore plugin
  useEffect(() => {
    loadDeviceSongs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const groupedByAlbum = allSongs.reduce((acc, s) => {
    const a = (s.album || '').trim() || 'Uncategorized';
    (acc[a] = acc[a] || []).push(s);
    return acc;
  }, {});

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
      const payload = buildPlaybackPayload({
        currentSong,
        currentTime: audioRef.current ? audioRef.current.currentTime : 0,
        isPlaying,
        queue,
        serverTime,
      });

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

    const streamUrl = resolveSongUrl(currentSong);
    if (!streamUrl) {
      audio.pause();
      try { audio.removeAttribute('src'); audio.load(); setCurrentDuration(0); } catch (e) {}
      return;
    }

    // set crossOrigin and preload so metadata and range requests work reliably
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';

    // compare by id to avoid absolute/relative URL differences
    const songIdentifier = currentSong.source === 'device' ? currentSong.id : currentSong._id;
    const srcIncludesId = audio.src && songIdentifier && String(audio.src).includes(String(songIdentifier));
    if (!srcIncludesId) {
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
      // IMPORTANT: a guest's local pause now PERSISTS across track changes.
      // We still preload the new track's src (so it's ready to go), but we
      // do not auto-play it if this guest has paused locally — they have to
      // tap "Rejoin Live" themselves, same as if the track hadn't changed.
      const shouldPlay = isPlaying && playbackEnabled && !guestPausedRef.current;
      applyAudioSrc(streamUrl, shouldPlay, resumeTime);
      return;
    }


    const trySyncTime = () => {
      try { if (typeof audio.duration === 'number' && !Number.isNaN(audio.duration)) setCurrentDuration(audio.duration); } catch (e) {}
      if (guestPausedRef.current) {
        audio.pause();
        return;
      }
      // Only correct drift >3 s — smaller corrections interrupt buffering and cause pops/clicks
      if (!Number.isNaN(currentTime) && Math.abs(audio.currentTime - currentTime) > 3) {
        try { audio.currentTime = currentTime; } catch (e) {}
      }
      if (isPlaying) {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('Sync play error:', err.name);
            }
          });
        }
      } else audio.pause();
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

  // Guest continuous sync correction - keep correcting drift but less aggressively,
  // and smoothly (playbackRate nudges) rather than hard seeks where possible.
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

      // Calculate expected time based on last sync (already clock-offset-compensated
      // upstream in the socket handler / fetchRoom poll)
      const now = Date.now() - (clockOffsetRef.current || 0);
      const expectedServerTime = expectedTimeAtSync || 0;
      let targetTime = expectedServerTime;

      if (lastSyncTimestamp > 0 && isPlaying) {
        const timeSinceSyncMs = now - lastSyncTimestamp;
        const timeSinceSyncSec = timeSinceSyncMs / 1000;
        targetTime = expectedServerTime + timeSinceSyncSec;
      }

      smoothSyncAudio(audio, targetTime);
      setCurrentTime(audio.currentTime);
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

  const buildPlaybackPayload = (overrides = {}) => {
    const song = overrides.currentSong ?? currentSong ?? null;
    const songId = song ? (song._id || song.id || null) : null;
    const songPayload = song ? {
      _id: songId,
      id: song.id || songId,
      title: song.title || 'Unknown',
      artist: song.artist || 'Unknown Artist',
      album: song.album || 'Unknown Album',
      duration: song.duration || 0,
      source: song.source || 'uploaded',
    } : null;

    return {
      currentSongId: songId,
      currentSong: songPayload,
      currentTime: typeof overrides.currentTime === 'number' ? overrides.currentTime : (audioRef.current ? audioRef.current.currentTime : 0),
      isPlaying: typeof overrides.isPlaying === 'boolean' ? overrides.isPlaying : isPlaying,
      queue: buildQueuePayload(overrides.queue ?? queue),
      serverTime: typeof overrides.serverTime === 'number' ? overrides.serverTime : Date.now(),
    };
  };

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

  // Helper: upload a device song to the backend and return a server song object
  const uploadDeviceSong = async (song) => {
    if (!song) throw new Error('No song provided for upload');

    const existing = findMatchingUploadedSong(song);
    if (existing) {
      console.debug('Skipping upload because matching uploaded song already exists', existing._id);
      return existing;
    }

    const uploadKey = song.contentUri || song.id || song.url || `${song.title}-${song.artist}`;
    
    try {
      // Mark as uploading
      setUploadingDeviceSongs(prev => ({
        ...prev,
        [uploadKey]: { status: 'uploading', progress: 10, message: 'Uploading device song...' }
      }));
      setError('Uploading device song: ' + (song.title || 'Unknown'));

      // Read the device song as base64
      setUploadingDeviceSongs(prev => ({
        ...prev,
        [uploadKey]: { status: 'uploading', progress: 30, message: 'Reading file...' }
      }));
      const { base64, mimeType } = await MusicService.readSongAsBase64(song.contentUri);
      console.log('Song read successfully, base64 length:', base64.length, 'mimeType:', mimeType);

      // Convert base64 to Blob
      setUploadingDeviceSongs(prev => ({
        ...prev,
        [uploadKey]: { status: 'uploading', progress: 50, message: 'Converting file...' }
      }));
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      console.log('Blob created, size:', blob.size, 'bytes');

      // Create FormData for multipart/form-data upload
      setUploadingDeviceSongs(prev => ({
        ...prev,
        [uploadKey]: { status: 'uploading', progress: 70, message: 'Uploading to server...' }
      }));
      const formData = new FormData();
      formData.append('file', blob, `${song.title}.mp3`);
      formData.append('title', song.title || 'Unknown');
      formData.append('artist', song.artist || 'Unknown Artist');
      formData.append('album', song.album || 'Unknown Album');
      formData.append('duration', Math.floor(song.duration / 1000)); // Convert ms to seconds
      formData.append('folder', 'device-uploads');

      console.log('Uploading with metadata:', {
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: Math.floor(song.duration / 1000),
        fileSize: blob.size
      });

      // Upload to backend
      const response = await fetch(`${API_SONGS}/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || `Upload failed with status ${response.status}`;
        console.error('Upload failed:', errorMsg, errorData);
        throw new Error(errorMsg);
      }

      const responseData = await response.json();
      console.log('Full upload response:', responseData);

      // Backend returns { message, song: {...} } structure
      // Extract the song object (handle both nested and flat structures)
      let uploadedSong = responseData.song || responseData;
      
      console.log('Extracted uploadedSong:', uploadedSong);

      if (!uploadedSong || !uploadedSong._id) {
        console.error('Invalid upload response - missing _id:', uploadedSong);
        throw new Error('Server returned invalid response - missing song ID');
      }

      // Ensure all required fields are present
      const normalizedSong = {
        _id: uploadedSong._id,
        title: uploadedSong.title || song.title || 'Unknown',
        artist: uploadedSong.artist || song.artist || 'Unknown Artist',
        album: uploadedSong.album || song.album || 'Unknown Album',
        duration: uploadedSong.duration || Math.floor(song.duration / 1000),
        source: 'uploaded'
      };

      setAllSongs((prev) => {
        if (prev.some((s) => s._id === normalizedSong._id)) return prev;
        return [normalizedSong, ...prev];
      });

      console.log('Normalized uploaded song:', normalizedSong);

      // Mark upload as done
      setUploadingDeviceSongs(prev => ({
        ...prev,
        [uploadKey]: { status: 'done', progress: 100, message: 'Upload complete!' }
      }));

      // Clear error after a short delay
      setTimeout(() => {
        setError('');
        setUploadingDeviceSongs(prev => {
          const updated = { ...prev };
          delete updated[uploadKey];
          return updated;
        });
      }, 1500);

      return normalizedSong;
    } catch (error) {
      console.error('uploadDeviceSong error:', error);
      const errorMsg = `Failed to upload device song: ${error.message}`;
      setError(errorMsg);
      
      setUploadingDeviceSongs(prev => ({
        ...prev,
        [uploadKey]: { status: 'error', progress: 0, message: errorMsg }
      }));
      
      throw error;
    }
  };

  // Host adds a song to the queue
  const addSongToQueue = async (song) => {
    if (!isHost) return;

    const isDevice = song && song.source === 'device';
    const uploadedMatch = isDevice ? findMatchingUploadedSong(song) : null;
    const actualSong = uploadedMatch || song;
    const isDeviceUpload = isDevice && !uploadedMatch;
    const placeholder = isDeviceUpload ? { ...song } : actualSong;

    console.debug('addSongToQueue (placeholder)', placeholder._id || placeholder.id, placeholder);

    // Optimistically add to queue and (if empty) start playback immediately for host
    setQueue(prev => {
      if (currentSong && currentSong._id) {
        playedStackRef.current.push(currentSong);
      }
      const queued = [...prev, placeholder];
      const queueToStore = currentSong ? queued : prev;
      try { sessionStorage.setItem(`room_${roomCode}_queue`, JSON.stringify(queueToStore)); } catch (e) {}

      // If no currentSong, start playing the placeholder immediately (host only)
      if (!currentSong) {
        setCurrentSong(placeholder);
        setIsPlaying(true);
        if (audioRef.current) {
          const audioUrl = isDevice ? resolveSongUrl(placeholder) : `${API_SONGS}/${placeholder._id}/stream`;
          if (audioUrl) applyAudioSrc(audioUrl, true);
        }

        const payload = buildPlaybackPayload({ currentSong: placeholder, currentTime: 0, isPlaying: true, queue: queueToStore });
        emitHostPlayback(payload);
        persistPlayback(payload);
      } else {
        const payload = buildPlaybackPayload({ currentSong, currentTime: audioRef.current ? audioRef.current.currentTime : 0, isPlaying, queue: queued });
        emitHostPlayback(payload);
        persistPlayback(payload);
      }
      return queueToStore;
    });

    // If it's a device song, upload in background and replace the placeholder when done
    if (isDevice) {
      (async () => {
        try {
          const uploaded = await uploadDeviceSong(song);
          // Replace placeholder in queue with uploaded song object
          setQueue(prev => {
            const replaced = prev.map(q => {
              // match by device id
              if (q && q.id && song.id && q.id === song.id) return uploaded;
              return q;
            });
            try { sessionStorage.setItem(`room_${roomCode}_queue`, JSON.stringify(replaced)); } catch (e) {}
            return replaced;
          });

          // If currentSong is the placeholder, update it to the uploaded song (keep playback)
          setCurrentSong(prev => {
            if (!prev) return prev;
            if ((prev.id && song.id && prev.id === song.id) || (prev._id && prev._id === uploaded._id)) {
              return uploaded;
            }
            return prev;
          });

          // Broadcast updated playback state with uploaded _id so guests can stream
          setTimeout(() => {
            const q = (queue || []);
            const payload = buildPlaybackPayload({
              currentSong: (currentSong && ((currentSong.id && currentSong.id === song.id) ? { ...currentSong, ...uploaded } : currentSong)) || { ...uploaded, source: 'uploaded' },
              currentTime: audioRef.current ? audioRef.current.currentTime : 0,
              isPlaying,
              queue: q,
            });
            emitHostPlayback(payload);
            persistPlayback(payload);
          }, 100);
        } catch (err) {
          console.error('Background upload failed for device song:', err);
          setError('Failed to upload device song: ' + (err.message || 'Upload error'));
        }
      })();
    }
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
      const playPromise = audioRef.current.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err.name === 'AbortError') {
            console.debug('Play interrupted (expected when switching)');
          } else {
            console.warn('play blocked', err);
          }
        });
      }
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(newPlaying);
    const payload = buildPlaybackPayload({
      currentSong,
      currentTime: audioRef.current ? audioRef.current.currentTime : 0,
      isPlaying: newPlaying,
      queue,
    });
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Guest toggles their own local audio — does NOT affect the room or other users.
  // On resume, audio seeks to the current live position so the guest rejoins in sync.
  // This pause now persists across host track changes too (see effects above) —
  // a guest can pause, the host can skip songs while they're away, and the guest's
  // audio simply stays paused (loaded on the new track) until they tap Rejoin.
  const guestTogglePlayPause = () => {
    if (isHost) return; // guard — hosts use togglePlayPause
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentSong || currentSong.source === 'device') return;
    if (!playbackEnabled) return; // must tap "Listen Live" first

    if (guestPaused) {
      // Re-sync to the current live position before resuming
      const now = Date.now() - (clockOffsetRef.current || 0);
      let targetTime = expectedTimeAtSync || 0;
      if (lastSyncTimestamp > 0 && isPlaying) {
        const elapsed = Math.max(0, (now - lastSyncTimestamp) / 1000);
        targetTime = (expectedTimeAtSync || 0) + elapsed;
      }
      // Set ref immediately (before React schedules the state update) so any
      // socket/interval callback that fires in the same tick sees the new value.
      guestPausedRef.current = false;
      setPlaybackError('');
      try { audio.currentTime = targetTime; audio.playbackRate = 1; } catch (e) {}
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err.name === 'AbortError') {
            console.debug('Guest resume interrupted (expected)');
          } else {
            console.warn('Guest resume playback blocked', err);
            setPlaybackError('Playback was blocked by the browser. Tap Listen Live again.');
          }
        });
      }
      setGuestPaused(false);
    } else {
      audio.pause();
      // Set ref immediately — don't wait for the useEffect to sync it.
      // The next socket event (arrives within 300ms) must see guestPaused=true
      // so it doesn't call audio.play() and override the pause.
      guestPausedRef.current = true;
      setPlaybackError('');
      setGuestPaused(true);
    }
  };

  // Guest taps "Tap to Listen Live" — enables playback (satisfies the browser's
  // user-gesture requirement) and starts audio at the current live position
  // instead of at 0.
  const enableGuestPlayback = () => {
    setPlaybackEnabled(true);
    setPlaybackError('');
    const audio = audioRef.current;
    if (!audio) return;
    
    // Ensure the audio element is ready before trying to play
    if (audio.readyState < 2) { // HAVE_CURRENT_DATA = 2
      console.warn('Audio not ready yet (readyState:', audio.readyState, ')');
      setPlaybackError('Loading audio... please wait a moment and try again.');
      return;
    }
    
    const now = Date.now() - (clockOffsetRef.current || 0);
    let targetTime = expectedTimeAtSync || 0;
    if (lastSyncTimestamp > 0 && isPlaying) {
      const elapsed = Math.max(0, (now - lastSyncTimestamp) / 1000);
      targetTime = (expectedTimeAtSync || 0) + elapsed;
    }
    if (targetTime > 0) {
      try { audio.currentTime = targetTime; } catch (e) {}
    }
    
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        // Ignore AbortError — it's expected when interrupting a play during src change
        if (err.name === 'AbortError') {
          console.debug('Audio play interrupted (expected when switching tracks)');
          return;
        }
        // For other errors, show a message
        console.warn('Guest playback activation error:', err);
        if (err.name === 'NotAllowedError') {
          setPlaybackError('Playback blocked by browser. Please tap again.');
        } else {
          setPlaybackError(`Playback error: ${err.message}`);
        }
      });
    }
  };

  // Update guest volume and apply it to the audio element
  const changeGuestVolume = (v) => {
    setGuestVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  // When current song ends
  const handleEnded = () => {
    if (!isHost) return; // Only host controls playback progression
    if (currentSong && (currentSong._id || currentSong.id)) {
      playedStackRef.current.push(currentSong);
    }

    setQueue(prev => {
      if (prev.length === 0) {
        setCurrentSong(null);
        setIsPlaying(false);
        const payload = buildPlaybackPayload({ currentSong: null, currentTime: 0, isPlaying: false, queue: [] });
        emitHostPlayback(payload);
        persistPlayback(payload);
        return [];
      }

      const [next, ...rest] = prev;
      setCurrentSong(next);
      setIsPlaying(true);

      const payload = buildPlaybackPayload({ currentSong: next, currentTime: 0, isPlaying: true, queue: rest });
      emitHostPlayback(payload);
      persistPlayback(payload);

      return rest;
    });
  };

  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
  };

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

  // Host: remove a single entry from the queue by index
  const removeFromQueue = (index) => {
    setQueue(prev => {
      const newQ = prev.filter((_, i) => i !== index);
      const payload = buildPlaybackPayload({ currentSong, currentTime: audioRef.current ? audioRef.current.currentTime : 0, isPlaying, queue: newQ });
      emitHostPlayback(payload);
      persistPlayback(payload);
      return newQ;
    });
  };

  // Host: play now
  const playNow = async (song) => {
    if (!isHost) return;
    
    let songToPlay = song;
    const isDevice = song && song.source === 'device';

    if (isDevice) {
      // Play device song locally immediately (host can play local contentUri/blob)
      songToPlay = { ...song };
      if (audioRef.current) {
        const localUrl = resolveSongUrl(songToPlay);
        if (localUrl) applyAudioSrc(localUrl, true);
      }
      // Start upload in background and replace currentSong once uploaded
      (async () => {
        try {
          const uploaded = await uploadDeviceSong(song);
          setQueue(prev => {
            const replaced = prev.map(q => {
              if (q && q.id && song.id && q.id === song.id) return uploaded;
              return q;
            });
            try { sessionStorage.setItem(`room_${roomCode}_queue`, JSON.stringify(replaced)); } catch (e) {}
            return replaced;
          });
          setCurrentSong(prev => (prev && prev.id === song.id) ? uploaded : prev);

          const payload = {
            currentSongId: uploaded._id,
            currentSong: {
              _id: uploaded._id,
              title: uploaded.title,
              artist: uploaded.artist,
              album: uploaded.album,
              duration: uploaded.duration,
              source: 'uploaded'
            },
            currentTime: audioRef.current ? audioRef.current.currentTime : 0,
            isPlaying,
            queue: buildQueuePayload([])
          };
          emitHostPlayback(payload);
          persistPlayback(payload);
        } catch (err) {
          console.error('Background upload failed for playNow:', err);
          setError('Failed to upload device song: ' + (err.message || 'Upload error'));
        }
      })();
    }
    
    if (currentSong && currentSong._id) {
      playedStackRef.current.push(currentSong);
    }
    setQueue([]);
    setCurrentSong(songToPlay);
    setIsPlaying(true);
    if (audioRef.current) {
      if (isDevice) {
        const localUrl = resolveSongUrl(songToPlay);
        if (localUrl) applyAudioSrc(localUrl, true);
      } else {
        const audioUrl = `${API_SONGS}/${songToPlay._id}/stream`;
        if (audioUrl) applyAudioSrc(audioUrl, true);
      }
    }

    const payload = buildPlaybackPayload({ currentSong: songToPlay, currentTime: 0, isPlaying: true, queue: [] });
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Helper to set audio src and play only after canplay to avoid races/AbortError
  function applyAudioSrc(url, shouldPlay = false, startTime = 0) {
    const audio = audioRef.current;
    if (!audio) return;

    // Helper to safely play audio and ignore AbortError (expected when src changes)
    const safePlay = () => {
      if (!shouldPlay) return;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err.name === 'AbortError') {
            console.debug('Play interrupted by src change (expected)');
          } else {
            console.warn('Play error:', err.name, err.message);
          }
        });
      }
    };

    // clear when no url requested
    if (!url) {
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
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
        if (shouldPlay) {
          safePlay();
        } else {
          try { audio.pause(); } catch (e) {}
        }
        return;
      }
    } catch (e) { /* ignore */ }

    // remove any previous pending listener
    if (audioPendingRef.current.listener) {
      try { audio.removeEventListener('canplay', audioPendingRef.current.listener); } catch (e) {}
      audioPendingRef.current.listener = null;
    }

    // Pause any currently playing audio before switching src
    try { audio.pause(); } catch (e) {}

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
      safePlay();
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
      const payload = buildPlaybackPayload({ currentSong, currentTime: t, isPlaying, queue });
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
      const prevUrl = resolveSongUrl(prev);
      if (prevUrl) applyAudioSrc(prevUrl, true);
    }
    const payload = buildPlaybackPayload({ currentSong: prev, currentTime: 0, isPlaying: true, queue });
    emitHostPlayback(payload);
    persistPlayback(payload);
  };

  // Skip next
  const skipNext = () => {
    if (!isHost) { alert('Only host can skip to next track.'); return; }
    handleEnded();
  };

  // Host: rename the room
  const updateRoomName = async (newName) => {
    if (!newName || newName === room?.name) return;
    try {
      const res = await fetch(`${API_ROOMS}/${roomCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      setRoom(data);
      alert('Room name updated');
    } catch (err) {
      alert(err.message || 'Error updating room name');
    }
  };

  // Leave the room (fetch + notify parent)
  const leaveRoom = async () => {
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
  };

  return {
    // room / status
    room, error, loadingRoom, isReconnecting, users, isHost, userId,

    // songs
    allSongs, allSongsLoading, allSongsError, groupedByAlbum,

    // playback
    queue, currentSong, currentTime, currentDuration, bufferedEnd, isPlaying,
    audioRef,

    // guest-only
    guestPaused, playbackEnabled, guestVolume, playbackError,

    // device songs
    deviceSongs, songTab, setSongTab, deviceFileInputRef,
    deviceSongsLoading, deviceSongsError, uploadingDeviceSongs,

    // album UI state
    albumExpanded, setAlbumExpanded,

    // actions
    addSongToQueue,
    togglePlayPause,
    guestTogglePlayPause,
    enableGuestPlayback,
    changeGuestVolume,
    seekBy,
    playPrevious,
    skipNext,
    playNow,
    removeUser,
    removeFromQueue,
    deleteUploadedSong,
    resolveSongObj,
    handleDeviceFileInput,
    loadDeviceSongs,
    onTimeUpdate,
    handleEnded,
    updateRoomName,
    leaveRoom,
  };
}
