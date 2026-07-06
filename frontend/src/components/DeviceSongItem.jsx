import React, { useState } from 'react';
import { useQueue } from '../contexts/QueueContext';
import { usePlaylist } from '../contexts/PlaylistContext';
import { usePlayRequest } from '../contexts/PlayRequestContext';
import { useAuth } from '../hooks/useAuth';
import './songItems.css';

/**
 * DeviceSongItem - Enhanced song item for device songs with queue/playlist/request actions
 */
export const DeviceSongItem = ({ song, roomCode, socket, isHost, onPlay }) => {
  const { addToQueue } = useQueue();
  const { addToPlaylist } = usePlaylist();
  const { createPlayRequest } = usePlayRequest();
  const { token } = useAuth();
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);

  const handleAddToQueue = async () => {
    try {
      setActionLoading('queue');
      setActionError(null);
      await addToQueue(song, roomCode, token);
      socket?.emit('queueItemAdded', { roomCode });
    } catch (err) {
      setActionError('Failed to add to queue');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddToPlaylist = async () => {
    try {
      setActionLoading('playlist');
      setActionError(null);
      if (isHost) {
        await addToPlaylist(song, roomCode, token);
        socket?.emit('playlistItemAdded', { roomCode });
      } else {
        // Guests suggest adding to playlist by creating a play request with a note
        await createPlayRequest(song, roomCode, token, 'Suggest add to playlist');
        socket?.emit('playlistSuggestionCreated', { roomCode, request: song });
      }
    } catch (err) {
      setActionError('Failed to add to playlist');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestPlay = async () => {
    try {
      setActionLoading('request');
      setActionError(null);
      await createPlayRequest(song, roomCode, token);
      socket?.emit('playRequestCreated', { roomCode, request: song });
    } catch (err) {
      setActionError(err.message || 'Failed to request song');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="song-item device-song-item">
      <div className="song-info">
        <p className="song-title">{song.title}</p>
        <p className="song-artist">{song.artist}</p>
      </div>

      <div className="song-actions">
        <button
          className="action-btn play-btn"
          onClick={() => onPlay(song)}
          title="Play now"
        >
          ▶
        </button>

        <>
          {isHost && (
            <button
              className="action-btn queue-btn"
              onClick={handleAddToQueue}
              disabled={actionLoading === 'queue'}
              title="Add to queue"
            >
              {actionLoading === 'queue' ? '⏳' : '⊕'}
            </button>
          )}

          {/* Playlist button shown to both hosts and guests. Guests will create a suggestion/request */}
          <button
            className="action-btn playlist-btn"
            onClick={handleAddToPlaylist}
            disabled={actionLoading === 'playlist'}
            title={isHost ? 'Add to playlist' : 'Suggest to playlist'}
          >
            {actionLoading === 'playlist' ? '⏳' : '♫'}
          </button>

          {!isHost && (
            <button
              className="action-btn request-btn"
              onClick={handleRequestPlay}
              disabled={actionLoading === 'request'}
              title="Request this song"
            >
              {actionLoading === 'request' ? '⏳' : '🎵'}
            </button>
          )}
        </>
      </div>

      {actionError && <p className="action-error">{actionError}</p>}
    </div>
  );
};

export default DeviceSongItem;
