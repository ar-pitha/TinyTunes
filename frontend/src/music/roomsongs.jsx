import React from 'react';
import { useRoomPlayback, formatTime } from './useRoomPlayback';
import './roomsongs.css';

const Room = ({ roomCode, onLeaveRoom, userId }) => {
  const {
    // room / status
    room, error, loadingRoom, isReconnecting, users, isHost,

    // songs
    allSongs, allSongsLoading, allSongsError, groupedByAlbum,

    // playback
    queue, currentSong, currentTime, currentDuration, bufferedEnd, isPlaying,
    audioRef,

    // guest-only
    guestPaused, playbackEnabled, guestVolume, playbackError,

    // device songs
    deviceSongs, songTab, setSongTab, deviceFileInputRef,
    deviceSongsLoading, deviceSongsError,

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
    resolveSongObj,
    handleDeviceFileInput,
    loadDeviceSongs,
    onTimeUpdate,
    handleEnded,
    updateRoomName,
    leaveRoom,
  } = useRoomPlayback(roomCode, onLeaveRoom, userId);

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
          {isHost
            ? (isPlaying ? '⏸️ Pause' : '▶️ Play')
            : (guestPaused ? '▶️ Rejoin Live' : (isPlaying ? '⏸ Pause (just me)' : '▶️ Play'))
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
                    onClick={loadDeviceSongs}
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