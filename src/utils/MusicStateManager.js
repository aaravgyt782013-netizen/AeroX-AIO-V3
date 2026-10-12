// Compatibility layer for legacy owner commands. The old PlayerManager-based
// snapshot format was removed; active playback is managed by MusicManager now.
export const musicStateManager = {
  async backupAllPlayers(client) {
    const count = client.music?.lavalink?.players?.size || 0;
    return {
      success: false,
      count,
      error: "Legacy music snapshots are incompatible with the current Lavalink manager. Use the music system's built-in reconnect handling instead.",
    };
  },
  getBackupInfo() {
    return null;
  },
  async restoreAllPlayers() {
    return {
      success: false,
      restored: 0,
      total: 0,
      failed: 0,
      errors: ["Legacy music snapshots are not supported by the current music manager."],
      error: "No compatible backup exists.",
    };
  },
};
