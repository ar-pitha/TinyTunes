import { Capacitor } from '@capacitor/core';
import { API_SONGS } from './roomPlaybackConstants';

export const makeDeviceSongId = (file) => `device-${file.name}-${file.size}-${file.lastModified}`;

export const resolveSongUrl = (song) => {
  if (!song) return null;
  if (song.contentUri) return Capacitor.convertFileSrc(song.contentUri);
  if (song.source === 'device' && song.url) return song.url;
  if (song._id) return `${API_SONGS}/${song._id}/stream`;
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

export const buildQueuePayload = (q) => {
  return q.map((s) => {
    if (typeof s === 'string') {
      return { _id: s, title: '(unknown)', artist: '' };
    }
    return { _id: s._id, title: s.title || '(unknown)', artist: s.artist || '' };
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
