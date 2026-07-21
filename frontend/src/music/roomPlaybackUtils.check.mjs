// Self-check for queueAdditions merge logic. Run: node roomPlaybackUtils.check.mjs
// (Kept dependency-free so it runs without the Vite/React/Capacitor toolchain.)
const queueSongKey = (x) => String(x?.songId || x?._id || x?.id || '');
const queueAdditions = (prev = [], serverQueue = [], currentSong = null) => {
  const have = new Set((prev || []).map(queueSongKey));
  const curKey = currentSong ? queueSongKey(currentSong) : null;
  return (serverQueue || []).filter((it) => {
    const k = queueSongKey(it);
    return k && k !== curKey && !have.has(k);
  });
};

const ids = (arr) => arr.map(queueSongKey);
const assert = (c, m) => { if (!c) { throw new Error('FAIL: ' + m); } };

// New backend item (songId) not already queued → merged in.
assert(ids(queueAdditions([{ _id: 'a' }], [{ songId: 'b', _id: 'q1' }])).join() === 'b',
  'new song added');
// Already in in-memory queue → skipped (matched across songId/_id shapes).
assert(queueAdditions([{ _id: 'b' }], [{ songId: 'b', _id: 'q1' }]).length === 0,
  'duplicate skipped');
// Currently playing song → skipped.
assert(queueAdditions([], [{ songId: 'c' }], { _id: 'c' }).length === 0,
  'current song skipped');
// Empty / junk entries → nothing added, no crash.
assert(queueAdditions([], [{}, null]).length === 0, 'empty entries ignored');
// Idle room, two new songs → both surface (first one the host will auto-play).
assert(ids(queueAdditions([], [{ songId: 'x' }, { songId: 'y' }])).join() === 'x,y',
  'idle multi-add');

console.log('roomPlaybackUtils queueAdditions: all checks passed');
