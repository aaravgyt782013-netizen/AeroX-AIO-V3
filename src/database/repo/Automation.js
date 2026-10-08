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
      "enabled INTEGER DEFAULT 1, welcome_style TEXT DEFAULT 'embed', " +
      "dm_enabled INTEGER DEFAULT 0, dm_message TEXT DEFAULT NULL, " +
      "updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000))"
    );
    try { this.exec("ALTER TABLE welcome_settings ADD COLUMN welcome_style TEXT DEFAULT 'embed'"); } catch {}
    try { this.exec("ALTER TABLE welcome_settings ADD COLUMN dm_enabled INTEGER DEFAULT 0"); } catch {}
    try { this.exec("ALTER TABLE welcome_settings ADD COLUMN dm_message TEXT DEFAULT NULL"); } catch {}

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
    this.exec(
      "CREATE TABLE IF NOT EXISTS bot_guild_contacts (" +
      "guild_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, guild_name TEXT NOT NULL, " +
      "guild_icon TEXT DEFAULT NULL, joined_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), " +
      "updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000))"
    );
    logger.success("AutomationDatabase", "Automation tables initialized");
  }

  saveBotGuildContact(guildId, ownerId, guildName, guildIcon = null) {
    if (!guildId || !ownerId) return null;
    return this.exec(
      "INSERT INTO bot_guild_contacts (guild_id, owner_id, guild_name, guild_icon, joined_at, updated_at) VALUES (?, ?, ?, ?, COALESCE((SELECT joined_at FROM bot_guild_contacts WHERE guild_id = ?), ?), ?) " +
      "ON CONFLICT(guild_id) DO UPDATE SET owner_id = excluded.owner_id, guild_name = excluded.guild_name, guild_icon = excluded.guild_icon, updated_at = excluded.updated_at",
      [guildId, ownerId, guildName || "Unknown Server", guildIcon, guildId, Date.now(), Date.now()]
    );
  }

  getBotGuildContact(guildId) {
    return this.get("SELECT * FROM bot_guild_contacts WHERE guild_id = ?", [guildId]) || null;
  }

  deleteBotGuildContact(guildId) {
    return this.exec("DELETE FROM bot_guild_contacts WHERE guild_id = ?", [guildId]);
  }

  getWelcome(guildId) {
    return this.get("SELECT * FROM welcome_settings WHERE guild_id = ?", [guildId]) || null;
  }

  setWelcome(guildId, channelId, message, style = "embed") {
    const now = Date.now();
    const safeStyle = style === "direct" ? "direct" : "embed";
    return this.exec(
      "INSERT INTO welcome_settings (guild_id, channel_id, message, enabled, welcome_style, dm_enabled, dm_message, updated_at) " +
      "VALUES (?, ?, ?, 1, ?, 0, NULL, ?) ON CONFLICT(guild_id) DO UPDATE SET " +
      "channel_id = excluded.channel_id, message = excluded.message, enabled = 1, " +
      "welcome_style = excluded.welcome_style, updated_at = excluded.updated_at",
      [guildId, channelId, message, safeStyle, now],
    );
  }

  setWelcomeStyle(guildId, style = "embed") {
    const safeStyle = style === "direct" ? "direct" : "embed";
    return this.exec(
      "UPDATE welcome_settings SET welcome_style = ?, updated_at = ? WHERE guild_id = ?",
      [safeStyle, Date.now(), guildId]
    );
  }

  disableWelcome(guildId) {
    return this.exec("UPDATE welcome_settings SET enabled = 0, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }

  setWelcomeDM(guildId, message) {
    const now = Date.now();
    return this.exec(
      "INSERT INTO welcome_settings (guild_id, channel_id, message, enabled, welcome_style, dm_enabled, dm_message, updated_at) " +
      "VALUES (?, '', '', 0, 'embed', 1, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET " +
      "dm_enabled = 1, dm_message = excluded.dm_message, updated_at = excluded.updated_at",
      [guildId, message, now]
    );
  }

  setWelcomeDMEnabled(guildId, enabled) {
    return this.exec(
      "UPDATE welcome_settings SET dm_enabled = ?, updated_at = ? WHERE guild_id = ?",
      [enabled ? 1 : 0, Date.now(), guildId]
    );
  }

  disableWelcomeDM(guildId) {
    return this.setWelcomeDMEnabled(guildId, false);
  }

  getWelcomeDM(guildId) {
    const row = this.getWelcome(guildId);
    if (!row) return null;
    return {
      enabled: row.dm_enabled === 1 || row.dm_enabled === true,
      message: row.dm_message || null,
    };
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

  getAllAutoresponders(guildId) {
    return this.all("SELECT * FROM autoresponders WHERE guild_id = ? ORDER BY id ASC", [guildId]);
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
      "UPDATE autoresponders SET response = ?, match_type = ?, enabled = 1, updated_at = ? WHERE guild_id = ? AND id = ?",
      [response, nextType, Date.now(), guildId, id],
    );
  }

  setAutoresponderEnabled(guildId, id, enabled) {
    return this.exec(
      "UPDATE autoresponders SET enabled = ?, updated_at = ? WHERE guild_id = ? AND id = ?",
      [enabled ? 1 : 0, Date.now(), guildId, id],
    );
  }

  deleteAutoresponder(guildId, id) {
    return this.exec("DELETE FROM autoresponders WHERE guild_id = ? AND id = ?", [guildId, id]);
  }

  clearAutoresponders(guildId) {
    return this.exec("DELETE FROM autoresponders WHERE guild_id = ?", [guildId]);
  }
}
