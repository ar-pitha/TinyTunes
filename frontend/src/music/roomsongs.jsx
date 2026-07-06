import React from 'react';
import { useRoomPlayback, formatTime } from './useRoomPlaybackFunctions';
import './roomsongs.css';
import PlaylistPanel from '../components/PlaylistPanel';
import { useQueue } from '../contexts/QueueContext';
import QueuePanel from '../components/QueuePanel';
import HostRequestPanel from '../components/HostRequestPanel';

const Room = ({ roomCode, onLeaveRoom, userId }) => {
  const {
    // room / status
    room, error, loadingRoom, isReconnecting, users, isHost,

    // songs
    allSongs, allSongsLoading, allSongsError, groupedByAlbum,

    // playback
    queue, currentSong, currentTime, currentDuration, bufferedEnd, isPlaying,
    audioRef, socket,

    // guest-only
    guestPaused, playbackEnabled, guestVolume, playbackError,

    // device songs
    deviceSongs, songTab, setSongTab, deviceFileInputRef,
    deviceSongsLoading, deviceSongsError, uploadingDeviceSongs,

    // album UI state
    albumExpanded, setAlbumExpanded,

    // actions
    addSongToQueue,
    addSongToPlaylist,
    suggestSongToPlaylist,
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
    deleteProgress,
    refreshAllSongs,
    resolveSongObj,
    handleDeviceFileInput,
    loadDeviceSongs,
    onTimeUpdate,
    handleEnded,
    updateRoomName,
    leaveRoom,
  } = useRoomPlayback(roomCode, onLeaveRoom, userId);

  const { fetchQueue } = useQueue();

  // Device UI state: search, album pagination, song pagination, and expanded album
  const [deviceSearch, setDeviceSearch] = React.useState('');
  const [deviceAlbumPage, setDeviceAlbumPage] = React.useState(1); // paginates album names (25 per page)
  const [deviceSongPage, setDeviceSongPage] = React.useState(1); // paginates songs inside an expanded album
  const DEVICE_ALBUM_PAGE_SIZE = 25;
  const DEVICE_SONG_PAGE_SIZE = 25;
  const [expandedDeviceAlbum, setExpandedDeviceAlbum] = React.useState(null);
  // Uploaded albums pagination and search
  const [uploadedSearch, setUploadedSearch] = React.useState('');
  const [uploadedAlbumPage, setUploadedAlbumPage] = React.useState(1);
  const UPLOADED_ALBUM_PAGE_SIZE = 25;

  // Helper: clean titles by removing bracketed prefixes like "[iSongs.info]" and leading track numbers
  const cleanTitle = (t) => {
    if (!t) return '';
    return String(t).replace(/^\s*\[[^\]]*\]\s*/g, '').replace(/^\s*\d+\s*-\s*/g, '').trim();
  };

  // Group device songs by album for album-first UI
  const groupedDevice = React.useMemo(() => {
    const g = {};
    (deviceSongs || []).forEach(s => {
      const a = (s.album || '').trim() || 'Unknown Album';
      if (!g[a]) g[a] = [];
      g[a].push(s);
    });
    return g;
  }, [deviceSongs]);

  // Default expand first album when device songs load
  React.useEffect(() => {
    const albums = Object.keys(groupedDevice);
    if (albums.length > 0 && !expandedDeviceAlbum) {
      setExpandedDeviceAlbum(albums[0]);
      setDeviceAlbumPage(1);
      setDeviceSongPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceSongs]);

  // Render album block
  const renderAlbumBlock = (albumName, list) => {
    const expanded = !!albumExpanded[albumName];
    const songCount = list.length;

    return (
      <div key={albumName} className="album-block">
        <button
          type="button"
          className="album-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            padding: '0',
            textAlign: 'left'
          }}
          onClick={() => setAlbumExpanded(prev => ({ ...prev, [albumName]: !prev[albumName] }))}
        >
          <div>
            <h3 style={{ margin: 0 }}>{albumName}</h3>
            <div style={{ color: '#64748b', fontSize: '0.9em', marginTop: 4 }}>
              {songCount} song{songCount === 1 ? '' : 's'}
            </div>
          </div>
          <span style={{ fontSize: '1.1rem', color: '#666' }}>{expanded ? '▼' : '▶'}</span>
        </button>
        {expanded && (
          <table className="album-table" style={{ marginTop: 12 }}>
            <tbody>
              {list.map(s => (
                <tr key={s._id || s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{cleanTitle(s.title)}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9em', marginTop: 4 }}>{s.album}</div>
                  </td>
                  <td>
                    {isHost ? (
                      <>
                        <button onClick={() => playNow(s)}>Play Now</button>
                        <button onClick={() => addSongToQueue(s)}>Add to Queue</button>
                        <button onClick={() => addSongToPlaylist(s)} style={{ marginLeft: 8 }}>
                          Add to Playlist
                        </button>
                        <button
                          onClick={() => deleteUploadedSong(s._id)}
                          style={{ marginLeft: 8, backgroundColor: '#ef4444', color: '#fff' }}
                          disabled={deleteProgress[s._id] !== undefined}
                        >
                          {deleteProgress[s._id] ? 'Deleting...' : 'Delete'}
                        </button>
                        {deleteProgress[s._id] !== undefined && (
                          <div className="delete-progress-container">
                            <div className="delete-progress-bar" style={{ width: `${deleteProgress[s._id]}%` }} />
                            <div className="delete-progress-label">{deleteProgress[s._id]}% deleted</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button onClick={() => alert('Only host can add or play songs')} disabled>Host only</button>
                        <button onClick={() => suggestSongToPlaylist(s)} style={{ marginLeft: 8 }}>
                          Suggest to Playlist
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          onClick={() => {
            if (window.confirm('Are you sure you want to leave this room?')) {
              leaveRoom();
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
          {isHost ? (isPlaying ? 'Pause' : 'Play') : (guestPaused ? 'Join Live' : 'Listen')}
        </button>
      </div>

      {/* Panels: Queue, Playlist, Requests */}
      <div className="panels-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <QueuePanel roomCode={roomCode} socket={socket} />
        </div>
        <div style={{ flex: 1 }}>
          <PlaylistPanel roomCode={roomCode} socket={socket} isHost={isHost} onPlayQueue={async () => {
            // Prefer local queue state; if empty, try fetching from server
            try {
              let q = Array.isArray(queue) ? queue : [];
              if ((!q || q.length === 0) && fetchQueue) {
                try {
                  q = await fetchQueue(roomCode, null).catch(() => []);
                } catch (e) { q = []; }
              }
              if (!q || q.length === 0) {
                return alert('Queue is empty');
              }
              const first = q[0];
              // Use playNow to set currentSong locally and emit playback
              if (isHost && playNow) {
                // Normalize object: playNow expects song object with _id or id
                await playNow(first);
              } else {
                // Fallback: emit hostPlayback so server broadcasts
                const playback = {
                  currentSongId: first.songId || first._id || first.id,
                  currentSong: {
                    _id: first.songId || first._id || first.id,
                    title: first.title,
                    artist: first.artist,
                    album: first.album || '',
                    duration: first.duration || 0,
                    source: first.source || 'Queue',
                  },
                  currentTime: 0,
                  isPlaying: true,
                  queue: q,
                  serverTime: Date.now(),
                };
                socket?.emit('hostPlayback', { roomCode, playback });
              }
            } catch (e) {
              console.error('onPlayQueue error', e);
              alert('Failed to play queue');
            }
          }} />
        </div>
        <div style={{ width: 360 }}>
          <HostRequestPanel roomCode={roomCode} socket={socket} isHost={isHost} />
        </div>
      </div>

      {playbackError && (
        <div className="error" style={{ marginTop: 8 }}>{playbackError}</div>
      )}

      {!isHost && currentSong && currentSong.source !== 'device' && !playbackEnabled && (
        <div className="enable-playback-container">
          <button onClick={enableGuestPlayback}>
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
            onChange={(e) => changeGuestVolume(parseFloat(e.target.value))}
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
                    <button onClick={() => removeFromQueue(index)}>Remove</button>
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
              (() => {
                const uploadedAlbumNames = Object.keys(groupedByAlbum || {}).sort((a, b) => a.localeCompare(b));
                const term = (uploadedSearch || '').trim().toLowerCase();
                const filteredAlbums = uploadedAlbumNames.filter(albumName => {
                  if (!term) return true;
                  const albumMatch = albumName.toLowerCase().includes(term);
                  if (albumMatch) return true;
                  const list = groupedByAlbum[albumName] || [];
                  return list.some(s => cleanTitle(s.title).toLowerCase().includes(term));
                });
                const total = filteredAlbums.length;
                const start = (uploadedAlbumPage - 1) * UPLOADED_ALBUM_PAGE_SIZE;
                const pageAlbums = filteredAlbums.slice(start, start + UPLOADED_ALBUM_PAGE_SIZE);
                return (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                      <input
                        aria-label="Search uploaded songs"
                        placeholder="Search songs or albums..."
                        value={uploadedSearch}
                        onChange={(e) => { setUploadedSearch(e.target.value); setUploadedAlbumPage(1); }}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 240, flex: '1 1 auto' }}
                      />
                      <button
                        type="button"
                        className="refresh-button"
                        onClick={refreshAllSongs}
                        disabled={allSongsLoading}
                      >
                        🔄 Refresh
                      </button>
                      <div style={{ color: '#4b5563', minWidth: 180 }}>
                        {filteredAlbums.length} album{filteredAlbums.length === 1 ? '' : 's'} found
                      </div>
                    </div>
                    {pageAlbums.length > 0 ? (
                      pageAlbums.map(albumName => renderAlbumBlock(albumName, groupedByAlbum[albumName]))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                        No uploaded songs match your search.
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                      <button onClick={() => setUploadedAlbumPage(p => Math.max(1, p - 1))} disabled={uploadedAlbumPage <= 1}>Prev Albums</button>
                      <div style={{ alignSelf: 'center' }}>Album page {uploadedAlbumPage} of {Math.max(1, Math.ceil(total / UPLOADED_ALBUM_PAGE_SIZE))}</div>
                      <button onClick={() => setUploadedAlbumPage(p => p + 1)} disabled={start + UPLOADED_ALBUM_PAGE_SIZE >= total}>Next Albums</button>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No uploaded songs available</div>
            )}
          </>
        )}

        {/* Device songs tab */}
        {songTab === 'device' && (
          <div className="device-songs-section">
            {/* Toolbar: auto-load status + manual fallback + search */}
            <div className="device-songs-toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 auto' }}>
                {deviceSongsLoading ? (
                  <span className="device-loading">⏳ Loading device songs...</span>
                ) : deviceSongsError ? (
                  <span className="device-reload-hint">⚠️ {deviceSongsError}</span>
                ) : deviceSongs.length > 0 ? (
                  <span className="device-loaded-ok">✅ {deviceSongs.length} device songs loaded</span>
                ) : null}
              </div>

              <input
                aria-label="Search device songs"
                placeholder="Search songs or albums..."
                value={deviceSearch}
                onChange={(e) => { setDeviceSearch(e.target.value); setDeviceAlbumPage(1); setDeviceSongPage(1); }}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', minWidth: 220 }}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setExpandedDeviceAlbum('ALL'); setDeviceSongPage(1); setDeviceAlbumPage(1); }} className="load-device-btn">All Songs</button>
                {isHost && (
                  <>
                    <button
                      className="load-device-btn"
                      onClick={loadDeviceSongs}
                      disabled={deviceSongsLoading}
                    >
                      🔄 {deviceSongsLoading ? 'Loading...' : 'Refresh Device Songs'}
                    </button>
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
              <div>
                <h3>Device Music ({deviceSongs.length} songs)</h3>
                {Object.keys(uploadingDeviceSongs).length > 0 && (
                  <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: '#f0f9ff', borderRadius: '4px', borderLeft: '4px solid #3b82f6' }}>
                    {Object.entries(uploadingDeviceSongs).map(([contentUri, status]) => (
                      <div key={contentUri} style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{status.message}</div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                          <div style={{
                            width: `${status.progress}%`,
                            height: '100%',
                            backgroundColor: status.status === 'error' ? '#ef4444' : status.status === 'done' ? '#10b981' : '#3b82f6',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Albums list: show albums and expand a single album (default first) or show all songs */}
                <div className="device-albums">
                  {(() => {
                    const term = (deviceSearch || '').trim().toLowerCase();
                    const allAlbumNames = Object.keys(groupedDevice || {});
                    const albumsFiltered = allAlbumNames.filter(albumName => {
                      const albumMatch = albumName.toLowerCase().includes(term);
                      if (albumMatch) return true;
                      if (!term) return true;
                      // match any song title inside album
                      const list = groupedDevice[albumName] || [];
                      return list.some(s => cleanTitle(s.title).toLowerCase().includes(term));
                    });

                    // Album pagination
                    const totalAlbums = albumsFiltered.length;
                    const albumStart = (deviceAlbumPage - 1) * DEVICE_ALBUM_PAGE_SIZE;
                    const pagedAlbums = albumsFiltered.slice(albumStart, albumStart + DEVICE_ALBUM_PAGE_SIZE);

                    if (expandedDeviceAlbum === 'ALL') {
                      const filteredSongs = (deviceSongs || []).filter(s => {
                        const title = cleanTitle(s.title).toLowerCase();
                        const album = (s.album || '').toLowerCase();
                        return !term || title.includes(term) || album.includes(term);
                      });
                      const total = filteredSongs.length;
                      const start = (deviceSongPage - 1) * DEVICE_SONG_PAGE_SIZE;
                      const pageItems = filteredSongs.slice(start, start + DEVICE_SONG_PAGE_SIZE);
                      return (
                        <div className="album-block">
                          <table className="album-table">
                            <tbody>
                              {pageItems.map((s) => {
                                const uploadStatus = uploadingDeviceSongs[s.contentUri];
                                return (
                                  <tr key={s.id} style={{ opacity: uploadStatus ? 0.6 : 1 }}>
                                    <td>
                                      <span className="device-badge">📱</span>
                                      <strong>{cleanTitle(s.title)}</strong>
                                      <div style={{ color: '#94a3b8', fontSize: '0.85em' }}>{s.album}</div>
                                    </td>
                                    <td>
                                      {isHost ? (
                                        <>
                                          <button onClick={() => playNow(s)} disabled={!!uploadStatus}>Play Now</button>
                                          <button onClick={() => addSongToQueue(s)} disabled={!!uploadStatus}>Add to Queue</button>
                                          <button onClick={() => addSongToPlaylist(s)} disabled={!!uploadStatus} style={{ marginLeft: 8 }}>Add to Playlist</button>
                                        </>
                                      ) : (
                                        <>
                                          <button disabled>Host only</button>
                                          <button onClick={() => suggestSongToPlaylist(s)} style={{ marginLeft: 8 }}>Suggest to Playlist</button>
                                        </>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {/* Songs pagination */}
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                            <button onClick={() => setDeviceSongPage(p => Math.max(1, p - 1))} disabled={deviceSongPage <= 1}>Prev</button>
                            <div style={{ alignSelf: 'center' }}>Page {deviceSongPage} of {Math.max(1, Math.ceil(total / DEVICE_SONG_PAGE_SIZE))}</div>
                            <button onClick={() => setDeviceSongPage(p => p + 1)} disabled={start + DEVICE_SONG_PAGE_SIZE >= total}>Next</button>
                          </div>
                        </div>
                      );
                    }

                    // Show paginated album names
                    return (
                      <div>
                        {pagedAlbums.map(albumName => {
                          const list = groupedDevice[albumName] || [];
                          const isExpanded = expandedDeviceAlbum === albumName;
                          return (
                            <div key={albumName} className="album-block" style={{ marginBottom: 12 }}>
                              <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => { setExpandedDeviceAlbum(isExpanded ? null : albumName); setDeviceSongPage(1); }}>
                                <span>{albumName}</span>
                                <small style={{ color: '#64748b' }}>{list.length} songs</small>
                              </h4>
                              {isExpanded && (() => {
                                const filtered = list.filter(s => {
                                  const title = cleanTitle(s.title).toLowerCase();
                                  const album = (s.album || '').toLowerCase();
                                  return !term || title.includes(term) || album.includes(term);
                                });
                                const total = filtered.length;
                                const start = (deviceSongPage - 1) * DEVICE_SONG_PAGE_SIZE;
                                const pageItems = filtered.slice(start, start + DEVICE_SONG_PAGE_SIZE);
                                return (
                                  <div>
                                    <table className="album-table">
                                      <tbody>
                                        {pageItems.map(s => {
                                          const uploadStatus = uploadingDeviceSongs[s.contentUri];
                                          return (
                                            <tr key={s.id} style={{ opacity: uploadStatus ? 0.6 : 1 }}>
                                              <td>
                                                <span className="device-badge">📱</span>
                                                <strong>{cleanTitle(s.title)}</strong>
                                                <div style={{ color: '#94a3b8', fontSize: '0.85em' }}>{s.album}</div>
                                              </td>
                                              <td>
                                                {isHost ? (
                                                  <>
                                                    <button onClick={() => playNow(s)} disabled={!!uploadStatus}>Play Now</button>
                                                    <button onClick={() => addSongToQueue(s)} disabled={!!uploadStatus}>Add to Queue</button>
                                                    <button onClick={() => addSongToPlaylist(s)} disabled={!!uploadStatus} style={{ marginLeft: 8 }}>Add to Playlist</button>
                                                  </>
                                                ) : (
                                                  <>
                                                    <button disabled>Host only</button>
                                                    <button onClick={() => suggestSongToPlaylist(s)} style={{ marginLeft: 8 }}>Suggest to Playlist</button>
                                                  </>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    {/* Pagination for album songs */}
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                                      <button onClick={() => setDeviceSongPage(p => Math.max(1, p - 1))} disabled={deviceSongPage <= 1}>Prev</button>
                                      <div style={{ alignSelf: 'center' }}>Page {deviceSongPage} of {Math.max(1, Math.ceil(total / DEVICE_SONG_PAGE_SIZE))}</div>
                                      <button onClick={() => setDeviceSongPage(p => p + 1)} disabled={start + DEVICE_SONG_PAGE_SIZE >= total}>Next</button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}

                        {/* Album pagination controls */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                          <button onClick={() => setDeviceAlbumPage(p => Math.max(1, p - 1))} disabled={deviceAlbumPage <= 1}>Prev Albums</button>
                          <div style={{ alignSelf: 'center' }}>Album page {deviceAlbumPage} of {Math.max(1, Math.ceil(totalAlbums / DEVICE_ALBUM_PAGE_SIZE))}</div>
                          <button onClick={() => setDeviceAlbumPage(p => p + 1)} disabled={albumStart + DEVICE_ALBUM_PAGE_SIZE >= totalAlbums}>Next Albums</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
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
              updateRoomName(newName);
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
        preload="metadata"
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