import React, { useState, useEffect } from 'react';
import { useQueue } from '../contexts/QueueContext';
import { useAuth } from '../hooks/useAuth';
import './panels.css';

/**
 * QueuePanel - Displays the current queue and allows queue management
 */
export const QueuePanel = ({ roomCode, socket, playNow, isHost, onPause }) => {
  const { queue, addToQueue, removeFromQueue, fetchQueue, loading, error } = useQueue();
  const { user, token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [playingItemId, setPlayingItemId] = useState(null);

  useEffect(() => {
    if (roomCode && token) {
      fetchQueue(roomCode, token).catch(err => console.error('Failed to fetch queue:', err));
    }
  }, [roomCode, token]);

  // Listen for queue updates from socket
  useEffect(() => {
    if (socket) {
      socket.on('queueUpdated', (data) => {
        console.log('Queue updated:', data);
        if (data.queue && roomCode && token) {
          fetchQueue(roomCode, token);
        }
      });

      socket.on('queueCleared', () => {
        console.log('Queue cleared');
        if (roomCode && token) {
          fetchQueue(roomCode, token);
        }
      });

      return () => {
        socket.off('queueUpdated');
        socket.off('queueCleared');
      };
    }
  }, [socket, roomCode, token]);

  const handleRemoveFromQueue = async (itemId) => {
    try {
      await removeFromQueue(itemId, roomCode, token);
      socket?.emit('queueItemRemoved', { roomCode });
    } catch (err) {
      console.error('Failed to remove from queue:', err);
    }
  };

  return (
    <div className="queue-panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <h3>Queue ({queue.length})</h3>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="panel-content">
          {loading && <p className="loading">Loading queue...</p>}
          {error && <p className="error">{error}</p>}

          {queue.length === 0 ? (
            <p className="empty-message">Queue is empty</p>
          ) : (
            <div className="queue-list">
              {queue.map((item, index) => (
                <div key={item._id} className="queue-item">
                  <span className="item-number">{index + 1}</span>
                  <div className="item-info">
                    <p className="item-title">{item.title}</p>
                    <p className="item-artist">{item.artist}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {isHost && playNow && (
                      <>
                        {playingItemId !== item._id ? (
                          <button
                            className="play-btn"
                            onClick={() => {
                              setPlayingItemId(item._id);
                              playNow(item);
                            }}
                            title="Play this song now"
                          >
                            ▶
                          </button>
                        ) : (
                          <button
                            className="pause-btn"
                            onClick={() => {
                              setPlayingItemId(null);
                              if (onPause) onPause();
                            }}
                            title="Pause playback"
                          >
                            ⏸
                          </button>
                        )}
                      </>
                    )}
                    <button
                      className="remove-btn"
                      onClick={() => handleRemoveFromQueue(item._id)}
                      title="Remove from queue"
                    >
                      ✕
                    </button>
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

export default QueuePanel;
