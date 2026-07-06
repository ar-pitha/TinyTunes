import React, { createContext, useContext, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * QueueContext - Manages the temporary queue system
 * Provides queue state and operations for adding, removing, and reordering songs
 */
const QueueContext = createContext();

export const QueueProvider = ({ children }) => {
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Add a song to the queue
   */
  const addToQueue = useCallback((song, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/queue/add`, {
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
          throw new Error('Failed to add song to queue');
        }

        const data = await response.json();
        resolve(data.queueItem);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Remove a song from the queue
   */
  const removeFromQueue = useCallback((itemId, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/queue/${itemId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to remove song from queue');
        }

        // Remove from local state
        setQueue(prev => prev.filter(item => item._id !== itemId));
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
   * Reorder the queue
   */
  const reorderQueue = useCallback((newOrder, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/queue/reorder`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ newOrder })
        });

        if (!response.ok) {
          throw new Error('Failed to reorder queue');
        }

        const data = await response.json();
        setQueue(data.queue);
        resolve(data.queue);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Fetch the queue
   */
  const fetchQueue = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/queue`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch queue');
        }

        const data = await response.json();
        setQueue(data.queue);
        resolve(data.queue);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Clear the queue
   */
  const clearQueue = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/room/${roomCode}/queue`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to clear queue');
        }

        setQueue([]);
        setQueueIndex(-1);
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
   * Update queue locally (used when Socket.IO events arrive)
   */
  const updateQueueLocal = useCallback((newQueue) => {
    setQueue(newQueue);
  }, []);

  const value = {
    queue,
    queueIndex,
    setQueue,
    setQueueIndex,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    fetchQueue,
    clearQueue,
    updateQueueLocal,
    loading,
    error
  };

  return (
    <QueueContext.Provider value={value}>
      {children}
    </QueueContext.Provider>
  );
};

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};
