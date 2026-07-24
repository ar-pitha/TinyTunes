import { useEffect, useState, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  AlertCircle,
  Volume2,
  Repeat,
  Shuffle,
  ChevronLeft,
  Disc3,
} from 'lucide-react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { MusicService } from '../services/MusicService';
import './OfflineMusicPlayer.css';

/**
 * Offline Music Player Component
 *
 * Features:
 * - Fetch and display songs from device storage
 * - Play, pause, next, previous controls
 * - Current song display with progress tracking
 * - Song list with click-to-play functionality
 * - Loading and error states
 * - Empty state handling
 *
 * sPermission Handling:
 * - Requests READ_MEDIA_AUDIO permission on first load
 * - Gracefully handles permission denial
 */
const OfflineMusicPlayer = () => {
  const player = useAudioPlayer();
  const [volume, setVolume] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [view, setView] = useState('albums'); // 'albums', 'songs', 'player'
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  // Group songs by album
  const albums = useMemo(() => {
    if (!player.songs.length) return [];
    const albumMap = {};
    player.songs.forEach((song) => {
      const album = song.album || 'Unknown Album';
      if (!albumMap[album]) {
        albumMap[album] = [];
      }
      albumMap[album].push(song);
    });
    return Object.entries(albumMap).map(([name, songs]) => ({
      name,
      songs,
      artist: songs[0]?.artist || 'Unknown Artist',
      songCount: songs.length,
    }));
  }, [player.songs]);

  /**
   * Fetch songs on component mount
   * Request necessary permissions before fetching
   */
  useEffect(() => {
    const initializeSongs = async () => {
      player.setLoading(true);
      player.setError(null);

      try {
        // Request permission
        const permissionGranted =
          await MusicService.requestPermission();

        if (!permissionGranted) {
          player.setError(
            'Permission denied. Please allow access to read audio files.'
          );
          player.setLoading(false);
          return;
        }

        // Fetch songs from device
        const songs = await MusicService.getSongs();

        if (songs.length === 0) {
          player.setError('No songs found on device');
        } else {
          player.setSongs(songs);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        player.setError(err.message || 'Failed to load songs');
      } finally {
        player.setLoading(false);
      }
    };

    initializeSongs();
  }, []);

  return (
    <div className="min-h-screen bg-charcoal text-warm-gray" style={{ backgroundColor: '#2a2a2a', color: '#6b7280' }}>
      {/* Header */}
      <div className="sticky top-0 z-50 bg-charcoal border-b border-warm-purple/20 px-6 py-5 shadow-lg" style={{ backgroundColor: '#2a2a2a', borderColor: 'rgba(168, 85, 247, 0.2)' }}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-warm-purple/20 rounded-lg p-2" style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}>
              <Music className="w-6 h-6" style={{ color: '#a855f7' }} />
            </div>
            <h1 className="text-2xl font-serif font-bold" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
              Music Library
            </h1>
          </div>
          <button className="p-2 hover:bg-white/10 rounded-lg transition" style={{ color: '#faf8f6' }}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* Loading State */}
        {player.loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-4 mb-6" style={{ borderColor: 'rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }}></div>
            <p className="text-lg" style={{ color: '#faf8f6' }}>Loading your music library…</p>
          </div>
        )}

        {/* Error State */}
        {player.error && !player.loading && (
          <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
            <div>
              <h3 className="font-semibold mb-1 text-blue-900">ℹ️ Offline Player Not Available</h3>
              <p className="text-sm text-blue-800 mb-3">{player.error}</p>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!player.loading && player.songs.length > 0 && (
          <>
            {/* Player View */}
            {view === 'player' && player.currentSong && (
              <div className="space-y-6">
                <button
                  onClick={() => setView('songs')}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-semibold transition"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Back to Songs
                </button>
                <PlayerView
                  player={player}
                  volume={volume}
                  setVolume={setVolume}
                  repeat={repeat}
                  setRepeat={setRepeat}
                  shuffle={shuffle}
                  setShuffle={setShuffle}
                  songs={selectedAlbum?.songs || []}
                  onSongClick={(song) => {
                    const songIndex = player.songs.findIndex((s) => s.id === song.id);
                    player.playSong(songIndex);
                  }}
                />
              </div>
            )}

            {/* Songs View */}
            {view === 'songs' && selectedAlbum && (
              <div className="space-y-6">
                <button
                  onClick={() => setView('albums')}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-semibold transition"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Back to Albums
                </button>
                <div>
                  <AlbumHeader album={selectedAlbum} />
                  <div className="mt-8">
                    <SongsList
                      songs={selectedAlbum.songs}
                      onSongClick={(song) => {
                        const songIndex = player.songs.findIndex((s) => s.id === song.id);
                        player.playSong(songIndex);
                        setView('player');
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Albums View */}
            {view === 'albums' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3 mb-2">
                    <Music className="w-8 h-8 text-purple-600" />
                    My Music Library
                  </h2>
                  <p className="text-gray-600">{player.songs.length} songs in your library</p>
                </div>
                <AlbumsList
                  albums={albums}
                  onAlbumClick={(album) => {
                    setSelectedAlbum(album);
                    setView('songs');
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!player.loading && player.songs.length === 0 && !player.error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-6 rounded-full mb-6" style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
              <Disc3 className="w-16 h-16" style={{ color: '#a855f7' }} />
            </div>
            <h3 className="text-2xl font-bold mb-3" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>No albums found</h3>
            <p className="max-w-md leading-relaxed" style={{ color: '#9ca3af' }}>
              Add some music files to your device to get started. Your music
              library will appear here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Player View - Song Currently Playing with Spinning Vinyl
const PlayerView = ({
  player,
  volume,
  setVolume,
  repeat,
  setRepeat,
  shuffle,
  setShuffle,
  songs,
  onSongClick,
}) => {
  const { currentSong } = player;

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Player - Vinyl Centered */}
        <div className="flex flex-col items-center justify-center">
          {/* Spinning Vinyl Record */}
          <div className="mb-8 relative">
            <div
              className={`vinyl-record w-64 h-64 rounded-full shadow-2xl flex items-center justify-center ${
                player.isPlaying ? 'spin' : ''
              }`}
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                animation: player.isPlaying ? 'spin 3s linear infinite' : 'none',
              }}
            >
              {/* Vinyl Grooves */}
              <div className="absolute inset-0 rounded-full" style={{
                background: 'repeating-conic-gradient(from 0deg, transparent 0deg 1deg, rgba(0,0,0,0.1) 1deg 2deg)',
              }} />
              {/* Center Label */}
              <div className="w-24 h-24 bg-warm-purple rounded-full flex items-center justify-center shadow-lg relative z-10" style={{ backgroundColor: '#a855f7' }}>
                <Music className="w-12 h-12 text-white/50" />
              </div>
            </div>

            {/* Rotation Indicator Dots */}
            <div className="absolute inset-0 rounded-full" style={{
              background: 'repeating-conic-gradient(from 0deg, transparent 0deg 30deg, #c9a961 30deg 32deg)',
              animation: player.isPlaying ? 'spin 3s linear infinite' : 'none',
              opacity: 0.3,
            }} />
          </div>

          {/* Song Info */}
          <div className="text-center mb-8 w-full">
            <h2 className="text-3xl font-serif font-bold mb-2 line-clamp-2" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
              {currentSong?.title}
            </h2>
            <p className="text-lg" style={{ color: '#a855f7' }}>
              {currentSong?.artist}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full mb-8">
            <ProgressBar
              currentTime={player.currentTime}
              duration={player.duration}
              onSeek={player.seek}
            />
            <div className="flex justify-between text-xs mt-3" style={{ color: '#6b7280' }}>
              <span>{MusicService.formatTime(player.currentTime)}</span>
              <span>{MusicService.formatTime(player.duration)}</span>
            </div>
          </div>

          {/* Main Controls */}
          <div className="flex items-center justify-center gap-6 mb-6">
            <button
              onClick={player.handlePrevious}
              className="p-3 rounded-full transition"
              style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' }}
              title="Previous"
            >
              <SkipBack className="w-6 h-6" />
            </button>
            <button
              onClick={player.togglePlayPause}
              className="p-8 rounded-full transition shadow-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                color: 'white',
              }}
              title={player.isPlaying ? 'Pause' : 'Play'}
            >
              {player.isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </button>
            <button
              onClick={player.handleNext}
              className="p-3 rounded-full transition"
              style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' }}
              title="Next"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>

          {/* Secondary Controls */}
          <div className="flex items-center justify-center gap-4 pb-6 border-b" style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}>
            <button
              onClick={() => setShuffle(!shuffle)}
              className="p-2 rounded-full transition"
              style={{
                backgroundColor: shuffle ? '#a855f7' : 'rgba(168, 85, 247, 0.2)',
                color: shuffle ? 'white' : '#a855f7',
              }}
              title="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </button>
            <button
              onClick={() => setRepeat(!repeat)}
              className="p-2 rounded-full transition"
              style={{
                backgroundColor: repeat ? '#a855f7' : 'rgba(168, 85, 247, 0.2)',
                color: repeat ? 'white' : '#a855f7',
              }}
              title="Repeat"
            >
              <Repeat className="w-5 h-5" />
            </button>
          </div>

          {/* Volume Control */}
          <div className="mt-6 w-full">
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5" style={{ color: '#a855f7' }} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer volume-slider"
                style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}
                title="Volume"
              />
              <span className="text-sm font-semibold w-8 text-right" style={{ color: '#a855f7' }}>
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Songs List */}
        <div>
          <h3 className="text-2xl font-serif font-bold mb-6" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
            Album
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto song-list">
            {songs.map((song, idx) => (
              <div
                key={song.id}
                onClick={() => onSongClick(song)}
                className="p-4 rounded-lg cursor-pointer transition"
                style={{
                  backgroundColor: currentSong?.id === song.id ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.05)',
                  borderLeft: currentSong?.id === song.id ? '3px solid #c9a961' : '3px solid transparent',
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold w-6 text-center" style={{ color: '#6b7280' }}>
                    {currentSong?.id === song.id && player.isPlaying ? (
                      <PlayingBars />
                    ) : (
                      String(idx + 1).padStart(2, '0')
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: currentSong?.id === song.id ? '#c9a961' : '#faf8f6' }}>
                      {song.title}
                    </p>
                    <p className="text-sm truncate" style={{ color: '#6b7280' }}>
                      {song.artist}
                    </p>
                  </div>
                  <span className="text-sm font-mono flex-shrink-0" style={{ color: '#6b7280' }}>
                    {song.formattedDuration}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ProgressBar = ({ currentTime, duration, onSeek }) => {
  const percentage = duration ? (currentTime / duration) * 100 : 0;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  return (
    <div
      onClick={handleClick}
      className="w-full h-2 bg-gray-300 rounded-full cursor-pointer group relative overflow-hidden hover:h-3 transition-all"
    >
      <div
        className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full transition-all"
        style={{ width: `${percentage}%` }}
      ></div>
      <div
        className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all"
        style={{ left: `${percentage}%`, transform: 'translate(-50%, -50%)' }}
      ></div>
    </div>
  );
};

// Albums List View - Shelf Metaphor
const AlbumsList = ({ albums, onAlbumClick }) => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-4xl font-serif font-bold mb-2" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
          Your Collection
        </h2>
        <p style={{ color: '#a855f7' }}>
          {albums.length} album{albums.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Featured Album */}
      {albums.length > 0 && (
        <div
          onClick={() => onAlbumClick(albums[0])}
          className="group cursor-pointer mb-12"
          style={{ transform: `rotate(0deg)` }}
        >
          <div className="flex gap-8 items-end">
            <div
              className="w-48 h-48 rounded-lg shadow-2xl overflow-hidden group-hover:shadow-3xl transition-all duration-300 flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                transform: 'perspective(1000px) rotateY(-5deg)',
              }}
            >
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-24 h-24 text-white/30" />
              </div>
            </div>
            <div className="pb-4">
              <h3 className="text-3xl font-serif font-bold mb-2" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
                {albums[0].name}
              </h3>
              <p className="text-lg mb-4" style={{ color: '#a855f7' }}>
                {albums[0].artist}
              </p>
              <p className="text-sm" style={{ color: '#6b7280' }}>
                {albums[0].songCount} song{albums[0].songCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Album Grid - Shelf Style */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        {albums.slice(1).map((album, idx) => {
          const rotation = (idx % 2 === 0 ? -1 : 1) + (idx % 3) * 0.5;
          return (
            <div
              key={idx}
              onClick={() => onAlbumClick(album)}
              className="group cursor-pointer album-card"
              style={{
                transform: `rotate(${rotation}deg) perspective(1000px)`,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = `rotate(0deg) scale(1.05) perspective(1000px)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = `rotate(${rotation}deg) perspective(1000px)`;
              }}
            >
              <div
                className="w-full aspect-square rounded-lg shadow-xl overflow-hidden mb-3 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                }}
              >
                <Music className="w-16 h-16 text-white/30" />
              </div>
              <h3
                className="font-serif font-bold truncate text-sm"
                style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}
              >
                {album.name}
              </h3>
              <p className="text-xs truncate" style={{ color: '#6b7280' }}>
                {album.artist}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Album Header - for detail view
const AlbumHeader = ({ album }) => {
  return (
    <div className="rounded-lg p-8 border" style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.2)' }}>
      <div className="flex gap-8">
        <div className="w-40 h-40 rounded-lg flex items-center justify-center flex-shrink-0 shadow-xl" style={{
          background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
        }}>
          <Music className="w-20 h-20 text-white/40" />
        </div>
        <div className="flex-1">
          <h2 className="text-4xl font-serif font-bold mb-2" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
            {album.name}
          </h2>
          <p className="text-lg mb-6" style={{ color: '#a855f7' }}>
            {album.artist}
          </p>
          <div className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: 'rgba(201, 165, 97, 0.2)', color: '#c9a961' }}>
            {album.songCount} song{album.songCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

// Songs List - album detail view
const SongsList = ({ songs, onSongClick }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-serif font-bold mb-6" style={{ color: '#faf8f6', fontFamily: 'Georgia, serif' }}>
        Tracks
      </h3>
      <div className="space-y-3 song-list">
        {songs.map((song, idx) => (
          <div
            key={song.id}
            onClick={() => onSongClick(song)}
            className="px-4 py-3 transition-all cursor-pointer group rounded-lg border-l-4"
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.05)',
              borderColor: 'transparent',
              borderLeftColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
              e.currentTarget.style.borderLeftColor = '#c9a961';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.05)';
              e.currentTarget.style.borderLeftColor = 'transparent';
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold w-6 text-center" style={{ color: '#6b7280' }}>
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate transition" style={{ color: '#faf8f6' }}>
                  {song.title}
                </h3>
                <p className="text-sm" style={{ color: '#6b7280' }}>
                  {song.artist}
                </p>
              </div>
              <span className="text-sm font-mono flex-shrink-0" style={{ color: '#6b7280' }}>
                {song.formattedDuration}
              </span>
              <Play className="w-5 h-5 opacity-0 group-hover:opacity-100 transition ml-2" style={{ color: '#a855f7' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// Playing Animation Bars
const PlayingBars = () => {
  return (
    <svg
      className="playing-bars w-full h-full text-purple-400"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <g opacity="0.8">
        <rect x="4" y="6" width="2" height="12" className="animate-pulse" />
        <rect
          x="10"
          y="4"
          width="2"
          height="14"
          className="animate-pulse"
          style={{ animationDelay: '0.1s' }}
        />
        <rect
          x="16"
          y="8"
          width="2"
          height="8"
          className="animate-pulse"
          style={{ animationDelay: '0.2s' }}
        />
      </g>
    </svg>
  );
};

export default OfflineMusicPlayer;
