import React, { useState, useEffect } from 'react';
import { useQueue } from '../contexts/QueueContext';
import { usePlaylist } from '../contexts/PlaylistContext';
import { useAuth } from '../hooks/useAuth';
import './panels.css';

/**
 * PlaylistPanel - Displays the permanent playlist and allows playlist management
 */
export const PlaylistPanel = ({ roomCode, socket, isHost }) => {
  const { playlist, searchResults, fetchPlaylist, searchPlaylist, removeFromPlaylist, loading, error } = usePlaylist();
  const { token } = useAuth();
  const { addToQueue, fetchQueue, queue: localQueue } = useQueue();
  const API_BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (roomCode && token) {
      fetchPlaylist(roomCode, token).catch(err => console.error('Failed to fetch playlist:', err));
    }
  }, [roomCode, token]);

  // Listen for playlist updates from socket
  useEffect(() => {
    if (socket) {
      socket.on('playlistUpdated', (data) => {
        console.log('Playlist updated:', data);
        if (data.playlist && roomCode && token) {
          fetchPlaylist(roomCode, token);
        }
      });

      return () => {
        socket.off('playlistUpdated');
      };
    }
  }, [socket, roomCode, token]);

  // Listen for queue updates to optionally reflect related UI changes
  useEffect(() => {
    if (socket) {
      socket.on('queueUpdated', (data) => {
        // Optionally refresh queue elsewhere; playlist doesn't need to auto-refresh
        console.log('Queue updated:', data);
      });

      return () => socket.off('queueUpdated');
    }
  }, [socket]);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      setIsSearching(true);
      try {
        await searchPlaylist(query, roomCode, token);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleRemoveFromPlaylist = async (itemId) => {
    if (!isHost) {
      alert('Only host can remove songs from playlist');
      return;
    }

    try {
      await removeFromPlaylist(itemId, roomCode, token);
      socket?.emit('playlistItemRemoved', { roomCode });
    } catch (err) {
      console.error('Failed to remove from playlist:', err);
    }
  };

  const displayItems = isSearching ? searchResults : playlist;

  return (
    <div className="playlist-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
            <h3>Playlist ({playlist.length})</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="refresh-btn"
              title="Refresh playlist"
              onClick={() => fetchPlaylist(roomCode, token).catch(err => console.error(err))}
            >
              ⟳
            </button>
            {isHost && (
                    <button
                      className="play-queue-btn"
                      title="Play queue"
                      onClick={async () => {
                        try {
                          let q = [];
                          try {
                            q = await fetchQueue(roomCode, token) || [];
                          } catch (e) {
                            console.warn('fetchQueue failed, falling back to local queue', e);
                            q = [];
                          }

                          // Fallback to local queue state if server returned empty but client has items
                          if ((!q || q.length === 0) && Array.isArray(localQueue) && localQueue.length > 0) {
                            q = localQueue;
                          }

                          if (!q || q.length === 0) return alert('Queue is empty');
                          {isHost && (
                            <button
                              className="play-queue-btn"
                              title="Play queue"
                              onClick={async () => {
                                if (typeof onPlayQueue === 'function') {
                                  onPlayQueue();
                                  return;
                                }
                                // Fallback behavior if parent didn't provide handler
                                try {
                                  let q = [];
                                  try {
                                    q = await fetchQueue(roomCode, token) || [];
                                  } catch (e) {
                                    console.warn('fetchQueue failed, falling back to local queue', e);
                                    q = [];
                                  }

                                  if ((!q || q.length === 0) && Array.isArray(localQueue) && localQueue.length > 0) {
                                    q = localQueue;
                                  }

                                  if (!q || q.length === 0) return alert('Queue is empty');
                                  const first = q[0];
                                  const playback = {
                                    currentSongId: first.songId || first._id || first.id,
                                    currentSong: {
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
                                  // Persist playback to server so late-joiners can recover
                                  try {
                                    fetch(`${API_BASE}/api/rooms/${roomCode}/playback`, {
                                      method: 'PUT',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                      },
                                      body: JSON.stringify(playback),
                                    }).catch(e => console.warn('persist playback failed', e));
                                  } catch (e) {
                                    console.warn('persist playback error', e);
                                  }
                                } catch (e) {
                                  console.error('Play queue failed', e);
                                  alert('Failed to play queue');
                                }
                              }}
                            >
                              ▶ Play Queue
                            </button>
                          )}
                }}
              >
                ✕
              </button>
            )}
          </div>

          {loading && <p className="loading">Loading playlist...</p>}
          {error && <p className="error">{error}</p>}

          {displayItems.length === 0 ? (
            <p className="empty-message">
              {isSearching ? 'No songs match your search' : 'Playlist is empty'}
            </p>
          ) : (
            <div className="playlist-list">
              {displayItems.map((item, index) => (
                <div key={item._id} className="playlist-item">
                  <span className="item-number">{index + 1}</span>
                  <div className="item-info">
                    <p className="item-title">{item.title}</p>
                    <p className="item-artist">{item.artist}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      className="add-queue-btn"
                      title="Add to queue"
                      onClick={async () => {
                        try {
                          const songForQueue = {
                            id: item.songId || item._id || item.id,
                            title: item.title,
                            artist: item.artist,
                            album: item.album || '',
                            duration: item.duration || 0,
                            source: 'Playlist'
                          };
                          const added = await addToQueue(songForQueue, roomCode, token);
                          // Refresh queue elsewhere; emit handled by server
                          socket?.emit('queueItemAdded', { roomCode, queueItem: added });
                        } catch (err) {
                          console.error('Failed to add to queue:', err);
                          alert('Failed to add to queue');
                        }
                      }}
                    >
                      ➕ Queue
                    </button>

                    {isHost && (
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveFromPlaylist(item._id)}
                        title="Remove from playlist"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlaylistPanel;
