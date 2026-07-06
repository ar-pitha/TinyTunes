import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * PlaybackContext - Manages playback state and control
 * Provides centralized state for current song, playback status, and priority logic
 */
const PlaybackContext = createContext();

export const PlaybackProvider = ({ children }) => {
  const [currentSongId, setCurrentSongId] = useState(null);
  const [currentSource, setCurrentSource] = useState(null); // 'Queue' or 'Playlist'
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Play a song from queue or playlist
   */
  const playSong = useCallback((songId, source, index, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback/play`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            songId,
            source, // 'Queue' or 'Playlist'
            index
          })
        });

        if (!response.ok) {
          throw new Error('Failed to play song');
        }

        const data = await response.json();
        const playback = data.playback;

        setCurrentSongId(playback.currentSongId);
        setCurrentSource(playback.currentSource);
        setCurrentTime(playback.currentTime);
        setIsPlaying(playback.isPlaying);
        setCurrentQueueIndex(playback.currentQueueIndex);
        setCurrentPlaylistIndex(playback.currentPlaylistIndex);

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
   * Pause playback
   */
  const pausePlayback = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback/pause`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to pause playback');
        }

        const data = await response.json();
        setIsPlaying(false);
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
   * Resume playback
   */
  const resumePlayback = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback/resume`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to resume playback');
        }

        const data = await response.json();
        setIsPlaying(true);
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
   * Seek to a specific time
   */
  const seekTo = useCallback((time, roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback/seek`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ currentTime: time })
        });

        if (!response.ok) {
          throw new Error('Failed to seek');
        }

        const data = await response.json();
        setCurrentTime(data.playback.currentTime);
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
   * Skip to next song (host only)
   * Implements priority: Queue → Playlist
   */
  const nextSong = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback/next`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to skip to next song');
        }

        const data = await response.json();
        const playback = data.playback;

        setCurrentSongId(playback.currentSongId);
        setCurrentSource(playback.currentSource);
        setCurrentTime(playback.currentTime);
        setIsPlaying(playback.isPlaying);
        setCurrentQueueIndex(playback.currentQueueIndex);
        setCurrentPlaylistIndex(playback.currentPlaylistIndex);

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
   * Skip to previous song (host only)
   * Implements priority: Queue → Playlist
   */
  const previousSong = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback/previous`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to skip to previous song');
        }

        const data = await response.json();
        const playback = data.playback;

        setCurrentSongId(playback.currentSongId);
        setCurrentSource(playback.currentSource);
        setCurrentTime(playback.currentTime);
        setIsPlaying(playback.isPlaying);
        setCurrentQueueIndex(playback.currentQueueIndex);
        setCurrentPlaylistIndex(playback.currentPlaylistIndex);

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
   * Get current playback state
   */
  const fetchPlaybackState = useCallback((roomCode, token) => {
    return new Promise(async (resolve, reject) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/room/${roomCode}/playback`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch playback state');
        }

        const data = await response.json();
        const playback = data.playback;

        setCurrentSongId(playback.currentSongId);
        setCurrentSource(playback.currentSource);
        setCurrentTime(playback.currentTime);
        setDuration(playback.duration);
        setIsPlaying(playback.isPlaying);
        setCurrentQueueIndex(playback.currentQueueIndex);
        setCurrentPlaylistIndex(playback.currentPlaylistIndex);

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
   * Update playback state locally (used when Socket.IO events arrive)
   */
  const updatePlaybackLocal = useCallback((playback) => {
    setCurrentSongId(playback.currentSongId);
    setCurrentSource(playback.currentSource);
    setCurrentTime(playback.currentTime);
    setDuration(playback.duration || 0);
    setIsPlaying(playback.isPlaying);
    setCurrentQueueIndex(playback.currentQueueIndex || -1);
    setCurrentPlaylistIndex(playback.currentPlaylistIndex || -1);
  }, []);

  /**
   * Update current time locally for smooth playback UI
   */
  const updateCurrentTimeLocal = useCallback((time) => {
    setCurrentTime(Math.max(0, time));
  }, []);

  const value = {
    currentSongId,
    currentSource,
    currentTime,
    duration,
    isPlaying,
    currentQueueIndex,
    currentPlaylistIndex,
    setCurrentSongId,
    setCurrentSource,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setCurrentQueueIndex,
    setCurrentPlaylistIndex,
    playSong,
    pausePlayback,
    resumePlayback,
    seekTo,
    nextSong,
    previousSong,
    fetchPlaybackState,
    updatePlaybackLocal,
    updateCurrentTimeLocal,
    loading,
    error
  };

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};
