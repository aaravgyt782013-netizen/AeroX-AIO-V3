import { Database } from "#structures/classes/Database";
import { logger } from "#utils/logger";

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
  }

  ensureGuild(guildId) {
    this.exec("INSERT OR IGNORE INTO member_stats (guild_id, joins, leaves, updated_at) VALUES (?, 0, 0, ?)", [guildId, Date.now()]);
  }

  recordJoin(guildId) {
    this.ensureGuild(guildId);
    this.exec("UPDATE member_stats SET joins = joins + 1, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }

  recordLeave(guildId) {
    this.ensureGuild(guildId);
    this.exec("UPDATE member_stats SET leaves = leaves + 1, updated_at = ? WHERE guild_id = ?", [Date.now(), guildId]);
  }

  getStats(guildId) {
    this.ensureGuild(guildId);
    return this.get("SELECT * FROM member_stats WHERE guild_id = ?", [guildId]) || { joins: 0, leaves: 0 };
  }

  addCounter({ channelId, guildId, metric, label, userId }) {
    this.exec("INSERT OR REPLACE INTO member_counters (channel_id, guild_id, metric, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [channelId, guildId, metric, label, userId, Date.now()]);
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
      default: return guild.memberCount;
    }
  }

  async refreshGuild(guild) {
    const counters = this.getCounters(guild.id);
    for (const counter of counters) {
      try {
        const channel = await guild.channels.fetch(counter.channel_id).catch(() => null);
        if (!channel) {
          this.removeCounter(counter.channel_id, guild.id);
          continue;
        }
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
