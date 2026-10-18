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
      "CREATE TABLE IF NOT EXISTS automod_settings (guild_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, spam_limit INTEGER DEFAULT 5, mention_limit INTEGER DEFAULT 5, bad_words TEXT DEFAULT \"[]\", block_links INTEGER DEFAULT 0, anti_caps INTEGER DEFAULT 0, block_invites INTEGER DEFAULT 0, emoji_limit INTEGER DEFAULT 12, block_nsfw_links INTEGER DEFAULT 0, log_channel TEXT DEFAULT NULL, updated_at INTEGER DEFAULT 0)"
    );
    // Upgrade existing databases created before the expanded AutoMod options.
    for (const column of [
      "anti_caps INTEGER DEFAULT 0",
      "block_invites INTEGER DEFAULT 0",
      "emoji_limit INTEGER DEFAULT 12",
      "block_nsfw_links INTEGER DEFAULT 0",
      "log_channel TEXT DEFAULT NULL",
    ]) {
      try { this.exec("ALTER TABLE automod_settings ADD COLUMN " + column); } catch {}
    }
    this.exec("UPDATE automod_settings SET bad_words = '[]' WHERE bad_words IS NULL OR bad_words = ''");

    this.exec(
      "CREATE TABLE IF NOT EXISTS bot_guild_contacts (" +
      "guild_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, guild_name TEXT NOT NULL, " +
      "guild_icon TEXT DEFAULT NULL, joined_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), " +
      "updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000))"
    );
    logger.success("AutomationDatabase", "Automation tables initialized");
  }

  getAutoMod(guildId) {
    const row = this.get("SELECT * FROM automod_settings WHERE guild_id = ?", [guildId]);
    if (!row) return { guild_id: guildId, enabled: 0, spam_limit: 5, mention_limit: 5, bad_words: "[]", block_links: 0, anti_caps: 0, block_invites: 0, emoji_limit: 12, block_nsfw_links: 0, log_channel: null };
    return row;
  }

  setAutoMod(guildId, key, value) {
    const allowed = new Set(["enabled", "spam_limit", "mention_limit", "bad_words", "block_links", "anti_caps", "block_invites", "emoji_limit", "block_nsfw_links", "log_channel"]);
    if (!allowed.has(key)) throw new Error("Unsupported AutoMod setting");
    const current = this.getAutoMod(guildId);
    const next = { ...current, [key]: value };
    return this.exec("INSERT INTO automod_settings (guild_id, enabled, spam_limit, mention_limit, bad_words, block_links, anti_caps, block_invites, emoji_limit, block_nsfw_links, log_channel, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled, spam_limit=excluded.spam_limit, mention_limit=excluded.mention_limit, bad_words=excluded.bad_words, block_links=excluded.block_links, anti_caps=excluded.anti_caps, block_invites=excluded.block_invites, emoji_limit=excluded.emoji_limit, block_nsfw_links=excluded.block_nsfw_links, log_channel=excluded.log_channel, updated_at=excluded.updated_at", [guildId, next.enabled, next.spam_limit, next.mention_limit, next.bad_words, next.block_links, next.anti_caps || 0, next.block_invites || 0, next.emoji_limit || 12, next.block_nsfw_links || 0, next.log_channel || null, Date.now()]);
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
