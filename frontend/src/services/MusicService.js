import { registerPlugin } from "@capacitor/core";

// Register the native Capacitor plugin
const Mediastore = registerPlugin("Mediastore");

export class MusicService {
  /**
   * Check whether the native plugin is available
   */
  static isNativeAvailable() {
    return !!Mediastore;
  }

  /**
   * Request storage/audio permission
   */
  static async requestPermission() {
    try {
      if (!this.isNativeAvailable()) {
        throw new Error("MediaStore plugin is not available.");
      }

      const result = await Mediastore.requestPermission();

      return result.granted === true;
    } catch (error) {
      console.error("Permission request failed:", error);
      return false;
    }
  }

  /**
   * Check existing permission
   */
  static async checkPermission() {
    try {
      if (!this.isNativeAvailable()) {
        throw new Error("MediaStore plugin is not available.");
      }

      const result = await Mediastore.checkPermission();

      return result.granted === true;
    } catch (error) {
      console.error("Permission check failed:", error);
      return false;
    }
  }

  /**
   * Read songs from Android MediaStore
   */
  static async getSongs() {
    try {
      if (!this.isNativeAvailable()) {
        throw new Error("MediaStore plugin is not available.");
      }

      const granted = await this.checkPermission();

      if (!granted) {
        const permission = await this.requestPermission();

        if (!permission) {
          throw new Error("Storage permission denied.");
        }
      }

      const result = await Mediastore.getSongs();

      if (!result || !result.songs) {
        return [];
      }

      return result.songs
        .filter(song => song.contentUri)
        .map(song => ({
          id: song.id,
          title: song.title || "Unknown",
          artist: song.artist || "Unknown Artist",
          album: song.album || "Unknown Album",
          duration: song.duration || 0,
          size: song.size || 0,
          displayName: song.displayName || "",
          contentUri: song.contentUri,
          albumArtUri: song.albumArtUri || "",
          formattedDuration: this.formatDuration(song.duration || 0),
        }))
        .sort((a, b) => a.title.localeCompare(b.title));

    } catch (error) {
      console.error("MediaStore Error:", error);
      throw error;
    }
  }

  /**
   * Format milliseconds into MM:SS
   */
  static formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Format seconds into MM:SS
   */
  static formatTime(seconds) {
    if (!seconds || isNaN(seconds)) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}