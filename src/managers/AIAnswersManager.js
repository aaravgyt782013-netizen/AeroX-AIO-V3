import { Database } from "#structures/classes/Database";

class AIAnswersManager extends Database {
  constructor() {
    super("data/aianswers.sqlite");
    this.exec(`
      CREATE TABLE IF NOT EXISTS ai_answer_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT DEFAULT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.userLastReply = new Map();
    this.guildRecentReplies = new Map();
  }

  getChannel(guildId) {
    return this.get("SELECT channel_id FROM ai_answer_settings WHERE guild_id = ?", [guildId])?.channel_id || null;
  }

  setChannel(guildId, channelId) {
    this.exec(`INSERT INTO ai_answer_settings (guild_id, channel_id, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at`,
    [guildId, channelId, Date.now()]);
  }

  canReply(guildId, userId) {
    const now = Date.now();
    const userKey = guildId + ":" + userId;
    if (now - (this.userLastReply.get(userKey) || 0) < 10000) return false;
    const recent = (this.guildRecentReplies.get(guildId) || []).filter(time => now - time < 60000);
    if (recent.length >= 4) return false;
    this.userLastReply.set(userKey, now);
    recent.push(now);
    this.guildRecentReplies.set(guildId, recent);
    return true;
  }
}

export const aiAnswers = new AIAnswersManager();
