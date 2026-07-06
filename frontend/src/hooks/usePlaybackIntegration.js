import React, { useEffect, useRef } from 'react';
import { usePlayback } from '../contexts/PlaybackContext';
import { useQueue } from '../contexts/QueueContext';
import { usePlaylist } from '../contexts/PlaylistContext';
import { usePlayRequest } from '../contexts/PlayRequestContext';

/**
 * PlaybackIntegration - Central hub for integrating playback logic with contexts
 * Handles playback priority (Queue → Playlist) and Socket.IO synchronization
 */
export const usePlaybackIntegration = ({ roomCode, socket, token, isHost, audioRef }) => {
  const playback = usePlayback();
  const queue = useQueue();
  const playlist = usePlaylist();
  const playRequest = usePlayRequest();

  const playbackTimerRef = useRef(null);

  /**
   * Initialize playback by fetching all data
   */
  const initializePlayback = async () => {
    try {
      // Fetch all data
      await Promise.all([
        playback.fetchPlaybackState(roomCode, token),
        queue.fetchQueue(roomCode, token),
        playlist.fetchPlaylist(roomCode, token),
        playRequest.getPendingRequests(roomCode, token)
      ]);

      console.log('Playback initialized successfully');
    } catch (err) {
      console.error('Failed to initialize playback:', err);
    }
  };

  /**
   * Handle audio element events for smooth playback
   */
  useEffect(() => {
    if (!audioRef?.current) return;

    const audio = audioRef.current;

    // Update current time locally
    const handleTimeUpdate = () => {
      playback.updateCurrentTimeLocal(audio.currentTime);
    };

    // Handle song end
    const handleEnded = async () => {
      if (isHost && socket) {
        try {
          await playback.nextSong(roomCode, token);
          socket.emit('playbackStateChanged', { roomCode });
        } catch (err) {
          console.error('Failed to skip to next song:', err);
        }
      }
    };

    // Handle duration update
    const handleLoadedMetadata = () => {
      playback.setDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isHost, token, roomCode]);

  /**
   * Sync audio playback with current playback state
   */
  useEffect(() => {
    if (!audioRef?.current) return;

    const audio = audioRef.current;

    // Only update if source changes or playback state significantly changes
    if (playback.currentSongId) {
      // Here you would load the song URL based on currentSongId
      // This depends on how your song URLs are managed
      const currentSong = playback.currentSource === 'Queue'
        ? queue.queue[playback.currentQueueIndex]
        : playlist.playlist[playback.currentPlaylistIndex];

      if (currentSong && currentSong.songUrl) {
        if (audio.src !== currentSong.songUrl) {
          audio.src = currentSong.songUrl;
          audio.load();
        }

        // Sync playback state
        if (playback.isPlaying) {
          audio.play().catch(err => console.error('Play failed:', err));
        } else {
          audio.pause();
        }

        // Sync current time (with some tolerance to avoid constant seeking)
        if (Math.abs(audio.currentTime - playback.currentTime) > 0.5) {
          audio.currentTime = playback.currentTime;
        }
      }
    }
  }, [playback.currentSongId, playback.isPlaying, playback.currentTime, playback.currentSource]);

  /**
   * Setup Socket.IO listeners for real-time sync
   */
  useEffect(() => {
    if (!socket || !roomCode) return;

    // Queue updated
    socket.on('queueUpdated', (data) => {
      console.log('Queue updated via socket:', data);
      queue.updateQueueLocal(data.queue);
    });

    // Playlist updated
    socket.on('playlistUpdated', (data) => {
      console.log('Playlist updated via socket:', data);
      playlist.updatePlaylistLocal(data.playlist);
    });

    // Playback state sync
    socket.on('playbackStateSync', (data) => {
      console.log('Playback sync via socket:', data);
      playback.updatePlaybackLocal(data.playback);
    });

    // Song changed
    socket.on('songChanged', (data) => {
      console.log('Song changed via socket:', data);
      playback.updatePlaybackLocal({
        currentSongId: data.currentSongId,
        currentSource: data.source,
        isPlaying: data.isPlaying,
        currentTime: 0,
        syncTimestamp: data.syncTimestamp
      });
    });

    // Playback time update
    socket.on('playbackTimeUpdate', (data) => {
      console.log('Time update via socket:', data);
      playback.updateCurrentTimeLocal(data.currentTime);
    });

    // New play request
    socket.on('newPlayRequest', (data) => {
      console.log('New play request:', data);
      playRequest.addPendingRequestLocal(data.request);
    });

    return () => {
      socket.off('queueUpdated');
      socket.off('playlistUpdated');
      socket.off('playbackStateSync');
      socket.off('songChanged');
      socket.off('playbackTimeUpdate');
      socket.off('newPlayRequest');
    };
  }, [socket, roomCode]);

  /**
   * Handle guest song request
   */
  const requestSong = async (song) => {
    try {
      await playRequest.createPlayRequest(song, roomCode, token);
      socket?.emit('playRequestCreated', {
        roomCode,
        request: song,
        requestedByName: 'You'
      });
    } catch (err) {
      console.error('Failed to request song:', err);
      throw err;
    }
  };

  /**
   * Handle host adding to queue
   */
  const addToQueueAsHost = async (song) => {
    try {
      await queue.addToQueue(song, roomCode, token);
      socket?.emit('queueItemAdded', { roomCode });
    } catch (err) {
      console.error('Failed to add to queue:', err);
      throw err;
    }
  };

  /**
   * Handle host adding to playlist
   */
  const addToPlaylistAsHost = async (song) => {
    try {
      await playlist.addToPlaylist(song, roomCode, token);
      socket?.emit('playlistItemAdded', { roomCode });
    } catch (err) {
      console.error('Failed to add to playlist:', err);
      throw err;
    }
  };

  /**
   * Playback controls for host
   */
  const controls = {
    play: async (songId, source, index) => {
      if (!isHost) throw new Error('Only host can control playback');
      await playback.playSong(songId, source, index, roomCode, token);
      socket?.emit('playbackStateChanged', { roomCode });
    },

    pause: async () => {
      if (!isHost) throw new Error('Only host can control playback');
      await playback.pausePlayback(roomCode, token);
      socket?.emit('playbackStateChanged', { roomCode });
    },

    resume: async () => {
      if (!isHost) throw new Error('Only host can control playback');
      await playback.resumePlayback(roomCode, token);
      socket?.emit('playbackStateChanged', { roomCode });
    },

    seek: async (time) => {
      if (!isHost) throw new Error('Only host can control playback');
      await playback.seekTo(time, roomCode, token);
      socket?.emit('playbackStateChanged', { roomCode });
    },

    next: async () => {
      if (!isHost) throw new Error('Only host can control playback');
      await playback.nextSong(roomCode, token);
      socket?.emit('playbackStateChanged', { roomCode });
    },

    previous: async () => {
      if (!isHost) throw new Error('Only host can control playback');
      await playback.previousSong(roomCode, token);
      socket?.emit('playbackStateChanged', { roomCode });
    }
  };

  return {
    // State
    playback: playback,
    queue: queue,
    playlist: playlist,
    playRequest: playRequest,

    // Operations
    initializePlayback,
    addToQueueAsHost,
    addToPlaylistAsHost,
    requestSong,
    controls,

    // Utilities
    getCurrentSong: () => {
      if (playback.currentSource === 'Queue') {
        return queue.queue[playback.currentQueueIndex];
      } else if (playback.currentSource === 'Playlist') {
        return playlist.playlist[playback.currentPlaylistIndex];
      }
      return null;
    },

    isQueueActive: () => playback.currentSource === 'Queue' && queue.queue.length > 0,
    isPlaylistActive: () => playback.currentSource === 'Playlist' && playlist.playlist.length > 0
  };
};

export default usePlaybackIntegration;
