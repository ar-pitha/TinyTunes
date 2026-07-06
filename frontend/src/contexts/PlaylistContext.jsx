import React, { createContext, useContext, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * PlaylistContext - Manages the permanent room playlist
 * Provides playlist state and operations for adding, removing, reordering, and searching songs
 */
const PlaylistContext = createContext();

export const PlaylistProvider = ({ children }) => {
  const [playlist, setPlaylist] = useState([]);
  const [playlistIndex, setPlaylistIndex] = useState(-1);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Add a song to the playlist
   */
  const addToPlaylist = useCallback((song, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/playlist/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            songId: song.id || song._id,
            title: song.title,
            artist: song.artist,
            album: song.album || '',
            duration: song.duration || 0,
            source: song.source || 'Uploaded'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to add song to playlist');
        }

        const data = await response.json();
        resolve(data.playlistItem);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Remove a song from the playlist (host only)
   */
  const removeFromPlaylist = useCallback((itemId, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/playlist/${itemId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to remove song from playlist');
        }

        // Remove from local state
        setPlaylist(prev => prev.filter(item => item._id !== itemId));
        resolve();
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Reorder the playlist (host only)
   */
  const reorderPlaylist = useCallback((newOrder, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/playlist/reorder`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ newOrder })
        });

        if (!response.ok) {
          throw new Error('Failed to reorder playlist');
        }

        const data = await response.json();
        setPlaylist(data.playlist);
        resolve(data.playlist);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Fetch the playlist
   */
  const fetchPlaylist = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/playlist`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch playlist');
        }

        const data = await response.json();
        setPlaylist(data.playlist);
        resolve(data.playlist);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Search the playlist
   */
  const searchPlaylist = useCallback((query, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playlist/search?query=${encodeURIComponent(query)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to search playlist');
        }

        const data = await response.json();
        setSearchResults(data.results);
        resolve(data.results);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Clear search results
   */
  const clearSearch = useCallback(() => {
    setSearchResults([]);
  }, []);

  /**
   * Update playlist locally (used when Socket.IO events arrive)
   */
  const updatePlaylistLocal = useCallback((newPlaylist) => {
    setPlaylist(newPlaylist);
  }, []);

  const value = {
    playlist,
    playlistIndex,
    searchResults,
    setPlaylist,
    setPlaylistIndex,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    fetchPlaylist,
    searchPlaylist,
    clearSearch,
    updatePlaylistLocal,
    loading,
    error
  };

  return (
    <PlaylistContext.Provider value={value}>
      {children}
    </PlaylistContext.Provider>
  );
};

export const usePlaylist = () => {
  const context = useContext(PlaylistContext);
  if (!context) {
    throw new Error('usePlaylist must be used within a PlaylistProvider');
  }
  return context;
};
