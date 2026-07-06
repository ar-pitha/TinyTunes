import { Capacitor } from '@capacitor/core';
import { API_SONGS } from './roomPlaybackConstants';

export const makeDeviceSongId = (file) => `device-${file.name}-${file.size}-${file.lastModified}`;

export const resolveSongUrl = (song) => {
  if (!song) return null;
  // Prefer an explicit songId (e.g., queue items store underlying songId)
  if (song.songId) return `${API_SONGS}/${song.songId}/stream`;
  if (song._id) return `${API_SONGS}/${song._id}/stream`;
  if (song.id) return `${API_SONGS}/${song.id}/stream`;
  if (song.source === 'device' && song.url) return song.url;
  if (song.contentUri) return Capacitor.convertFileSrc(song.contentUri);
  return null;
};

export const smoothSyncAudio = (audio, targetTime, opts = {}) => {
  if (!audio || typeof targetTime !== 'number' || Number.isNaN(targetTime)) return;
  const { hardThreshold = 5, softThreshold = 1.2 } = opts;

  if (audio.paused) {
    try { if (audio.playbackRate !== 1) audio.playbackRate = 1; } catch (e) {}
    return;
  }

  const drift = audio.currentTime - targetTime;
  const absDrift = Math.abs(drift);

  if (absDrift > hardThreshold) {
    try {
      if (audio.playbackRate !== 1) audio.playbackRate = 1;
      audio.currentTime = targetTime;
    } catch (e) {}
  } else if (absDrift > softThreshold) {
    try { audio.playbackRate = drift > 0 ? 0.93 : 1.07; } catch (e) {}
  } else {
    try { if (audio.playbackRate !== 1) audio.playbackRate = 1; } catch (e) {}
  }
};

export function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '00:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const buildQueuePayload = (q = []) => {
  return (q || []).map((s) => {
    if (typeof s === 'string') {
      return { _id: s, id: s, songId: s, title: '(unknown)', artist: '', source: 'uploaded' };
    }
    const songId = s?.songId || s?._id || s?.id || null;
    const id = s?._id || s?.id || songId;
    return {
      _id: id,
      id,
      songId,
      title: s?.title || '(unknown)',
      artist: s?.artist || '',
      album: s?.album || '',
      duration: s?.duration || 0,
      source: s?.source || 'uploaded',
    };
  });
};

export const resolveSongObj = (entry, allSongs) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return allSongs.find((s) => s._id === entry) || { _id: entry, title: '(unknown)', artist: '' };
  }
  if (entry._id && (entry.title || entry.artist)) return entry;
  if (entry._id) return allSongs.find((s) => s._id === entry._id) || entry;
  return entry;
};
