import { Database } from "#structures/classes/Database";

class PremiumFeaturesManager extends Database {
  constructor() {
    super("data/premium-features.sqlite");
    this.exec(`
      CREATE TABLE IF NOT EXISTS level_stats (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        last_xp_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS level_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        announce_channel_id TEXT DEFAULT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS member_profiles (
        user_id TEXT PRIMARY KEY,
        title TEXT DEFAULT NULL,
        bio TEXT DEFAULT NULL,
        color TEXT NOT NULL DEFAULT '#5865F2',
        background_url TEXT DEFAULT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  getLevelSettings(guildId) {
    return this.get("SELECT * FROM level_settings WHERE guild_id = ?", [guildId]) || { guild_id: guildId, enabled: 1, announce_channel_id: null };
  }

  setLevelSettings(guildId, data = {}) {
    const current = this.getLevelSettings(guildId);
    const enabled = data.enabled ?? current.enabled ?? 1;
    const channelId = data.announce_channel_id === undefined ? current.announce_channel_id : data.announce_channel_id;
    return this.exec(`INSERT INTO level_settings (guild_id, enabled, announce_channel_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled, announce_channel_id=excluded.announce_channel_id, updated_at=excluded.updated_at`,
    [guildId, enabled ? 1 : 0, channelId, Date.now()]);
  }

  getLevel(guildId, userId) {
    return this.get("SELECT * FROM level_stats WHERE guild_id = ? AND user_id = ?", [guildId, userId]) || { guild_id: guildId, user_id: userId, xp: 0, level: 0, last_xp_at: 0 };
  }

  addXp(guildId, userId, amount, now = Date.now()) {
    const current = this.getLevel(guildId, userId);
    const xp = Math.max(0, current.xp + amount);
    const level = Math.floor(Math.sqrt(xp / 100));
    this.exec(`INSERT INTO level_stats (guild_id, user_id, xp, level, last_xp_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET xp=excluded.xp, level=excluded.level, last_xp_at=excluded.last_xp_at`,
    [guildId, userId, xp, level, now]);
    return { ...current, xp, level, previousLevel: current.level };
  }

  getLeaderboard(guildId, limit = 10) {
    return this.all("SELECT user_id, xp, level FROM level_stats WHERE guild_id = ? ORDER BY xp DESC LIMIT ?", [guildId, limit]);
  }

  getProfile(userId) {
    return this.get("SELECT * FROM member_profiles WHERE user_id = ?", [userId]) || { user_id: userId, title: null, bio: null, color: "#5865F2", background_url: null };
  }

  setProfile(userId, data = {}) {
    const current = this.getProfile(userId);
    const profile = {
      title: data.title === undefined ? current.title : data.title,
      bio: data.bio === undefined ? current.bio : data.bio,
      color: data.color ?? current.color ?? "#5865F2",
      background_url: data.background_url === undefined ? current.background_url : data.background_url
    };
    return this.exec(`INSERT INTO member_profiles (user_id, title, bio, color, background_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET title=excluded.title, bio=excluded.bio, color=excluded.color, background_url=excluded.background_url, updated_at=excluded.updated_at`,
    [userId, profile.title, profile.bio, profile.color, profile.background_url, Date.now()]);
  }
}

export const premiumFeatures = new PremiumFeaturesManager();
