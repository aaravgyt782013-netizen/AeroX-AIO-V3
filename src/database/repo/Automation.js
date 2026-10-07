import { Database } from "#structures/classes/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export class Automation extends Database {
  constructor() {
    super(config.database.automation);
    this.initTables();
  }

  initTables() {
    this.exec(
      "CREATE TABLE IF NOT EXISTS welcome_settings (" +
      "guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message TEXT NOT NULL, " +
      "enabled INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000))"
    );
    this.exec(
      "CREATE TABLE IF NOT EXISTS leave_settings (" +
      "guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message TEXT NOT NULL, " +
      "enabled INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000))"
    );
    this.exec(
      "CREATE TABLE IF NOT EXISTS autoresponders (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, " +
      "trigger_text TEXT NOT NULL COLLATE NOCASE, response TEXT NOT NULL, " +
      "match_type TEXT DEFAULT 'contains', enabled INTEGER DEFAULT 1, " +
      "created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), " +
      "updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), " +
      "UNIQUE(guild_id, trigger_text))"
    );
    logger.success("AutomationDatabase", "Automation tables initialized");
  }

  getWelcome(guildId) {
    return this.get("SELECT * FROM welcome_settings WHERE guild_id = ?", [guildId]) || null;
  }

  setWelcome(guildId, channelId, message) {
    const now = Date.now();
    return this.exec(
      "INSERT INTO welcome_settings (guild_id, channel_id, message, enabled, updated_at) " +
      "VALUES (?, ?, ?, 1, ?) ON CONFLICT(guild_id) DO UPDATE SET " +
      "channel_id = excluded.channel_id, message = excluded.message, enabled = 1, updated_at = excluded.updated_at",
      [guildId, channelId, message, now],
    );
  }

  disableWelcome(guildId) {
    return this.exec("UPDATE welcome_settings SET enabled = 0, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }

  getLeave(guildId) {
    return this.get("SELECT * FROM leave_settings WHERE guild_id = ?", [guildId]) || null;
  }

  setLeave(guildId, channelId, message) {
    const now = Date.now();
    return this.exec(
      "INSERT INTO leave_settings (guild_id, channel_id, message, enabled, updated_at) " +
      "VALUES (?, ?, ?, 1, ?) ON CONFLICT(guild_id) DO UPDATE SET " +
      "channel_id = excluded.channel_id, message = excluded.message, enabled = 1, updated_at = excluded.updated_at",
      [guildId, channelId, message, now],
    );
  }

  disableLeave(guildId) {
    return this.exec("UPDATE leave_settings SET enabled = 0, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }

  getAutoresponders(guildId) {
    return this.all("SELECT * FROM autoresponders WHERE guild_id = ? AND enabled = 1 ORDER BY id ASC", [guildId]);
  }

  getAutoresponder(guildId, id) {
    return this.get("SELECT * FROM autoresponders WHERE guild_id = ? AND id = ?", [guildId, id]) || null;
  }

  findAutoresponder(guildId, trigger) {
    return this.get("SELECT * FROM autoresponders WHERE guild_id = ? AND trigger_text = ?", [guildId, trigger]) || null;
  }

  addAutoresponder(guildId, trigger, response, matchType = "contains") {
    if (!trigger || !response) throw new Error("Trigger and response are required.");
    if (!["contains", "exact"].includes(matchType)) throw new Error("Invalid match type.");
    return this.exec(
      "INSERT INTO autoresponders (guild_id, trigger_text, response, match_type, enabled, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 1, ?, ?)",
      [guildId, trigger, response, matchType, Date.now(), Date.now()],
    );
  }

  updateAutoresponder(guildId, id, response, matchType = null) {
    const current = this.getAutoresponder(guildId, id);
    if (!current) return null;
    const nextType = matchType && ["contains", "exact"].includes(matchType) ? matchType : current.match_type;
    return this.exec(
      "UPDATE autoresponders SET response = ?, match_type = ?, updated_at = ? WHERE guild_id = ? AND id = ?",
      [response, nextType, Date.now(), guildId, id],
    );
  }

  deleteAutoresponder(guildId, id) {
    return this.exec("DELETE FROM autoresponders WHERE guild_id = ? AND id = ?", [guildId, id]);
  }

  clearAutoresponders(guildId) {
    return this.exec("DELETE FROM autoresponders WHERE guild_id = ?", [guildId]);
  }
}
