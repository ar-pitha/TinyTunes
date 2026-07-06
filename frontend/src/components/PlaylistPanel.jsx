import React, { useState, useEffect } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { useAuth } from '../hooks/useAuth';
import './panels.css';

/**
 * PlaylistPanel - Displays the permanent playlist and allows playlist management
 */
export const PlaylistPanel = ({ roomCode, socket, isHost }) => {
  const { playlist, searchResults, fetchPlaylist, searchPlaylist, removeFromPlaylist, loading, error } = usePlaylist();
  const { token } = useAuth();
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
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <h3>Playlist ({playlist.length})</h3>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="panel-content">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search playlist..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearching(false);
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlaylistPanel;
