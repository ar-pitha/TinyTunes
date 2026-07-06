import React, { createContext, useContext, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * PlayRequestContext - Manages play requests from guests
 * Provides state and operations for creating, approving, and rejecting song requests
 */
const PlayRequestContext = createContext();

export const PlayRequestProvider = ({ children }) => {
  const [playRequests, setPlayRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Create a new play request (guest users)
   */
  const createPlayRequest = useCallback((song, roomCode, token, notes = null) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/play-requests`, {
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
            source: song.source || 'Uploaded',
            notes
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create play request');
        }

        const data = await response.json();
        resolve(data.request);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Fetch all play requests for a room
   */
  const fetchPlayRequests = useCallback((roomCode, token, status = null) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        let url = `${API_BASE}/api/rooms/${roomCode}/play-requests`;
        if (status) {
          url += `?status=${status}`;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch play requests');
        }

        const data = await response.json();
        setPlayRequests(data.requests);
        
        // Also update pending requests
        const pending = data.requests.filter(req => req.status === 'Pending');
        setPendingRequests(pending);
        
        resolve(data.requests);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Approve a play request (host only)
   */
  const approvePlayRequest = useCallback((requestId, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/play-requests/${requestId}/approve`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to approve request');
        }

        const data = await response.json();

        // Update local state
        setPlayRequests(prev =>
          prev.map(req =>
            req._id === requestId ? { ...req, status: 'Accepted' } : req
          )
        );
        setPendingRequests(prev => prev.filter(req => req._id !== requestId));

        resolve(data);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Reject a play request (host only)
   */
  const rejectPlayRequest = useCallback((requestId, roomCode, token, reason = null) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/play-requests/${requestId}/reject`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ reason })
        });

        if (!response.ok) {
          throw new Error('Failed to reject request');
        }

        const data = await response.json();

        // Update local state
        setPlayRequests(prev =>
          prev.map(req =>
            req._id === requestId ? { ...req, status: 'Rejected' } : req
          )
        );
        setPendingRequests(prev => prev.filter(req => req._id !== requestId));

        resolve(data);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Get pending requests
   */
  const getPendingRequests = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/play-requests?status=Pending`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch pending requests');
        }

        const data = await response.json();
        setPendingRequests(data.requests);
        resolve(data.requests);
      } catch (err) {
        setError(err.message);
        reject(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /**
   * Update play requests locally (used when Socket.IO events arrive)
   */
  const updatePlayRequestsLocal = useCallback((newRequests) => {
    setPlayRequests(newRequests);
    const pending = newRequests.filter(req => req.status === 'Pending');
    setPendingRequests(pending);
  }, []);

  /**
   * Add pending request locally (when new request is created)
   */
  const addPendingRequestLocal = useCallback((request) => {
    setPendingRequests(prev => [...prev, request]);
    setPlayRequests(prev => [...prev, request]);
  }, []);

  const value = {
    playRequests,
    pendingRequests,
    setPlayRequests,
    setPendingRequests,
    createPlayRequest,
    fetchPlayRequests,
    approvePlayRequest,
    rejectPlayRequest,
    getPendingRequests,
    updatePlayRequestsLocal,
    addPendingRequestLocal,
    loading,
    error
  };

  return (
    <PlayRequestContext.Provider value={value}>
      {children}
    </PlayRequestContext.Provider>
  );
};

export const usePlayRequest = () => {
  const context = useContext(PlayRequestContext);
  if (!context) {
    throw new Error('usePlayRequest must be used within a PlayRequestProvider');
  }
  return context;
};
