import React, { useState, useEffect } from 'react';
import { usePlayRequest } from '../contexts/PlayRequestContext';
import { useAuth } from '../hooks/useAuth';
import './panels.css';

/**
 * HostRequestPanel - Allows host to review and approve/reject play requests
 */
export const HostRequestPanel = ({ roomCode, socket, isHost }) => {
  const { pendingRequests, approvePlayRequest, rejectPlayRequest, getPendingRequests, loading, error } = usePlayRequest();
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isHost && roomCode && token) {
      getPendingRequests(roomCode, token).catch(err => console.error('Failed to fetch requests:', err));
    }
  }, [isHost, roomCode, token]);

  // Listen for new play requests from socket
  useEffect(() => {
    if (socket && isHost) {
      socket.on('newPlayRequest', (data) => {
        console.log('New play request:', data);
        if (roomCode && token) {
          getPendingRequests(roomCode, token);
        }
      });

      return () => {
        socket.off('newPlayRequest');
      };
    }
  }, [socket, isHost, roomCode, token]);

  const handleApprove = async (requestId, request) => {
    try {
      await approvePlayRequest(requestId, roomCode, token);
      socket?.emit('playRequestApproved', { roomCode, requestId, userId: request.requestedBy });
    } catch (err) {
      console.error('Failed to approve request:', err);
    }
  };

  const handleReject = async (requestId) => {
    const reason = prompt('Enter rejection reason (optional):');
    try {
      await rejectPlayRequest(requestId, roomCode, token, reason);
      socket?.emit('playRequestRejected', { roomCode, requestId, reason });
    } catch (err) {
      console.error('Failed to reject request:', err);
    }
  };

  if (!isHost) {
    return null;
  }

  return (
    <div className="host-request-panel">
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <h3>Play Requests ({pendingRequests.length})</h3>
        {pendingRequests.length > 0 && <span className="badge">{pendingRequests.length}</span>}
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="panel-content">
          {loading && <p className="loading">Loading requests...</p>}
          {error && <p className="error">{error}</p>}

          {pendingRequests.length === 0 ? (
            <p className="empty-message">No pending requests</p>
          ) : (
            <div className="requests-list">
              {pendingRequests.map((request) => (
                <div key={request._id} className="request-item">
                  <div className="request-info">
                    <p className="requester">
                      <strong>{request.requestedByName}</strong> requested:
                    </p>
                    <p className="song-title">{request.songTitle}</p>
                    <p className="song-artist">{request.songArtist}</p>
                    {request.notes && (
                      <p className="request-notes">Notes: {request.notes}</p>
                    )}
                  </div>
                  <div className="request-actions">
                    <button
                      className="approve-btn"
                      onClick={() => handleApprove(request._id, request)}
                      title="Approve request"
                    >
                      ✓ Add
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => handleReject(request._id)}
                      title="Reject request"
                    >
                      ✕ Reject
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

export default HostRequestPanel;
