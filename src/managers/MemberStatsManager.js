import { Database } from "#structures/classes/Database";
import { logger } from "#utils/logger";

const dayKey = (timestamp = Date.now()) => new Date(timestamp + 330 * 60 * 1000).toISOString().slice(0, 10);

class MemberStatsManager extends Database {
  constructor() {
    super("data/memberstats.sqlite");
    this.exec(`
      CREATE TABLE IF NOT EXISTS member_stats (
        guild_id TEXT PRIMARY KEY,
        joins INTEGER NOT NULL DEFAULT 0,
        leaves INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS member_counters (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        label TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS member_activity (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        voice_ms INTEGER NOT NULL DEFAULT 0,
        voice_started_at INTEGER DEFAULT NULL,
        last_message_at INTEGER DEFAULT NULL,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS member_daily_activity (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, day)
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS member_channel_daily (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        day TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, channel_id, day)
      )
    `);
    this.counterRefreshAt = new Map();
  }

  ensureGuild(guildId) {
    this.exec("INSERT OR IGNORE INTO member_stats (guild_id, joins, leaves, updated_at) VALUES (?, 0, 0, ?)", [guildId, Date.now()]);
  }
  ensureMember(guildId, userId) {
    this.exec("INSERT OR IGNORE INTO member_activity (guild_id, user_id) VALUES (?, ?)", [guildId, userId]);
  }
  recordJoin(guildId) {
    this.ensureGuild(guildId);
    this.exec("UPDATE member_stats SET joins = joins + 1, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }
  recordLeave(guildId) {
    this.ensureGuild(guildId);
    this.exec("UPDATE member_stats SET leaves = leaves + 1, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }
  recordMessage(guildId, userId, channelId = null, timestamp = Date.now()) {
    this.ensureMember(guildId, userId);
    const day = dayKey(timestamp);
    this.exec("UPDATE member_activity SET messages = messages + 1, last_message_at = ? WHERE guild_id = ? AND user_id = ?", [timestamp, guildId, userId]);
    this.exec(`INSERT INTO member_daily_activity (guild_id, user_id, day, messages) VALUES (?, ?, ?, 1)
      ON CONFLICT(guild_id, user_id, day) DO UPDATE SET messages = messages + 1`, [guildId, userId, day]);
    if (channelId) {
      this.exec(`INSERT INTO member_channel_daily (guild_id, user_id, channel_id, day, messages) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(guild_id, user_id, channel_id, day) DO UPDATE SET messages = messages + 1`, [guildId, userId, channelId, day]);
    }
  }
  startVoice(guildId, userId, timestamp = Date.now()) {
    this.ensureMember(guildId, userId);
    this.exec("UPDATE member_activity SET voice_started_at = COALESCE(voice_started_at, ?) WHERE guild_id = ? AND user_id = ?", [timestamp, guildId, userId]);
  }
  stopVoice(guildId, userId, timestamp = Date.now()) {
    this.ensureMember(guildId, userId);
    const row = this.get("SELECT voice_started_at FROM member_activity WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    if (!row?.voice_started_at) return;
    const elapsed = Math.max(0, timestamp - row.voice_started_at);
    this.exec("UPDATE member_activity SET voice_ms = voice_ms + ?, voice_started_at = NULL WHERE guild_id = ? AND user_id = ?", [elapsed, guildId, userId]);
  }
  getStats(guildId) {
    this.ensureGuild(guildId);
    const joins = this.get("SELECT * FROM member_stats WHERE guild_id = ?", [guildId]) || { joins: 0, leaves: 0 };
    const activity = this.get("SELECT COALESCE(SUM(messages), 0) AS messages, COALESCE(SUM(voice_ms + CASE WHEN voice_started_at IS NOT NULL THEN MAX(0, ? - voice_started_at) ELSE 0 END), 0) AS voice_ms FROM member_activity WHERE guild_id = ?", [Date.now(), guildId]) || { messages: 0, voice_ms: 0 };
    return { ...joins, messages: Number(activity.messages || 0), voice_ms: Number(activity.voice_ms || 0) };
  }
  getMemberStats(guildId, userId) {
    this.ensureMember(guildId, userId);
    const row = this.get("SELECT messages, voice_ms, voice_started_at, last_message_at FROM member_activity WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    const today = dayKey();
    const sevenDayStart = dayKey(Date.now() - 6 * 86400000);
    const thirtyDayStart = dayKey(Date.now() - 29 * 86400000);
    const daily = this.get(`SELECT
      COALESCE(SUM(CASE WHEN day = ? THEN messages ELSE 0 END), 0) AS today,
      COALESCE(SUM(CASE WHEN day >= ? THEN messages ELSE 0 END), 0) AS seven_day,
      COALESCE(SUM(CASE WHEN day >= ? THEN messages ELSE 0 END), 0) AS thirty_day
      FROM member_daily_activity WHERE guild_id = ? AND user_id = ?`, [today, sevenDayStart, thirtyDayStart, guildId, userId]) || {};
    return {
      messages: Number(row?.messages || 0),
      today: Number(daily.today || 0),
      seven_day: Number(daily.seven_day || 0),
      thirty_day: Number(daily.thirty_day || 0),
      voice_ms: Number(row?.voice_ms || 0) + (row?.voice_started_at ? Math.max(0, Date.now() - row.voice_started_at) : 0),
      last_message_at: row?.last_message_at || null
    };
  }
  getTopChannels(guildId, userId, limit = 3) {
    const start = dayKey(Date.now() - 29 * 86400000);
    return this.all(`SELECT channel_id, SUM(messages) AS messages FROM member_channel_daily
      WHERE guild_id = ? AND user_id = ? AND day >= ?
      GROUP BY channel_id ORDER BY messages DESC LIMIT ?`, [guildId, userId, start, limit]) || [];
  }
  getTopMembers(guildId, metric, limit = 5) {
    const column = metric === "voice" ? "voice_ms" : "messages";
    const rows = this.all(`SELECT user_id, messages, voice_ms FROM member_activity WHERE guild_id = ? ORDER BY ${column} DESC LIMIT ?`, [guildId, limit]) || [];
    return rows.map(row => ({ ...row, voice_ms: Number(row.voice_ms || 0) }));
  }
  addCounter({ channelId, guildId, metric, label, userId }) {
    this.exec("INSERT OR REPLACE INTO member_counters (channel_id, guild_id, metric, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", [channelId, guildId, metric, label, userId, Date.now()]);
  }
  removeCounter(channelId, guildId) {
    return this.exec("DELETE FROM member_counters WHERE channel_id = ? AND guild_id = ?", [channelId, guildId]);
  }
  getCounters(guildId) {
    return this.all("SELECT * FROM member_counters WHERE guild_id = ? ORDER BY created_at ASC", [guildId]);
  }
  async metricValue(guild, metric) {
    const members = guild.members.cache;
    switch (metric) {
      case "members": return guild.memberCount;
      case "humans": return members.filter(member => !member.user.bot).size;
      case "bots": return members.filter(member => member.user.bot).size;
      case "channels": return guild.channels.cache.filter(channel => channel.isTextBased() || channel.isVoiceBased()).size;
      case "roles": return guild.roles.cache.size;
      case "boosts": return guild.premiumSubscriptionCount || 0;
      case "messages": return this.getStats(guild.id).messages;
      case "voice": return Math.floor(this.getStats(guild.id).voice_ms / 60000);
      default: return guild.memberCount;
    }
  }
  async refreshGuild(guild, force = false) {
    const now = Date.now();
    if (!force && now - (this.counterRefreshAt.get(guild.id) || 0) < 600000) return;
    this.counterRefreshAt.set(guild.id, now);
    for (const counter of this.getCounters(guild.id)) {
      try {
        const channel = await guild.channels.fetch(counter.channel_id).catch(() => null);
        if (!channel) { this.removeCounter(counter.channel_id, guild.id); continue; }
        const value = await this.metricValue(guild, counter.metric);
        const name = `${counter.label}: ${Number(value).toLocaleString("en-US")}`.slice(0, 100);
        if (channel.name !== name) await channel.setName(name, "Refresh LightCore member stats counter");
      } catch (error) {
        logger.warn("MemberStats", `Could not refresh counter ${counter.channel_id}: ${error?.message || error}`);
      }
    }
  }
}
export const memberStats = new MemberStatsManager();
