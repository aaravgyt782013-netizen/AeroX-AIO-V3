import { db } from "#database/DatabaseManager";
import { config } from "#config/config";

const DEFAULTS = {
  enabled: false,
  punishment: "quarantine",
  logChannel: null,
  windowMs: 10000,
  thresholds: {
    channelDelete: 3, channelCreate: 6, roleDelete: 3, roleCreate: 6,
    memberBan: 3, memberKick: 4, webhook: 3, botAdd: 1,
    emojiDelete: 3, stickerDelete: 3, integration: 2,
    guildUpdate: 3, memberRoleUpdate: 4
  },
  whitelistUsers: [],
  whitelistRoles: []
};

const ACTION_MAP = {
  ChannelDelete: "channelDelete", ChannelCreate: "channelCreate",
  RoleDelete: "roleDelete", RoleCreate: "roleCreate",
  MemberBanAdd: "memberBan", MemberKick: "memberKick",
  WebhookCreate: "webhook", WebhookDelete: "webhook", WebhookUpdate: "webhook",
  BotAdd: "botAdd", EmojiDelete: "emojiDelete", StickerDelete: "stickerDelete",
  IntegrationCreate: "integration", IntegrationDelete: "integration", IntegrationUpdate: "integration",
  GuildUpdate: "guildUpdate", MemberRoleUpdate: "memberRoleUpdate",
  AutoModerationRuleCreate: "guildUpdate", AutoModerationRuleDelete: "guildUpdate",
  AutoModerationRuleUpdate: "guildUpdate"
};

class AntiNuke {
  constructor() {
    this.recent = new Map();
    this.init();
  }

  init() {
    db.guild.exec(`
      CREATE TABLE IF NOT EXISTS antinuke_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        punishment TEXT DEFAULT 'quarantine',
        log_channel TEXT DEFAULT NULL,
        window_ms INTEGER DEFAULT 10000,
        thresholds TEXT DEFAULT '{}',
        whitelist_users TEXT DEFAULT '[]',
        whitelist_roles TEXT DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  parseArray(value) {
    try { const x = JSON.parse(value || "[]"); return Array.isArray(x) ? x : []; }
    catch { return []; }
  }

  parseObject(value) {
    try { const x = JSON.parse(value || "{}"); return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
    catch { return {}; }
  }

  get(guildId) {
    const row = db.guild.get("SELECT * FROM antinuke_settings WHERE guild_id = ?", [guildId]);
    if (!row) return { ...DEFAULTS, thresholds: { ...DEFAULTS.thresholds }, whitelistUsers: [], whitelistRoles: [] };
    return {
      enabled: !!row.enabled,
      punishment: ["ban", "kick", "quarantine"].includes(row.punishment) ? row.punishment : "quarantine",
      logChannel: row.log_channel || null,
      windowMs: Math.max(3000, Math.min(60000, Number(row.window_ms) || 10000)),
      thresholds: { ...DEFAULTS.thresholds, ...this.parseObject(row.thresholds) },
      whitelistUsers: this.parseArray(row.whitelist_users),
      whitelistRoles: this.parseArray(row.whitelist_roles)
    };
  }

  save(guildId, patch = {}) {
    const current = this.get(guildId);
    const next = { ...current, ...patch, thresholds: { ...current.thresholds, ...(patch.thresholds || {}) } };
    db.guild.exec(`
      INSERT INTO antinuke_settings
      (guild_id, enabled, punishment, log_channel, window_ms, thresholds, whitelist_users, whitelist_roles, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
      enabled=excluded.enabled, punishment=excluded.punishment, log_channel=excluded.log_channel,
      window_ms=excluded.window_ms, thresholds=excluded.thresholds,
      whitelist_users=excluded.whitelist_users, whitelist_roles=excluded.whitelist_roles,
      updated_at=CURRENT_TIMESTAMP
    `, [
      guildId, next.enabled ? 1 : 0, next.punishment, next.logChannel, next.windowMs,
      JSON.stringify(next.thresholds), JSON.stringify(next.whitelistUsers), JSON.stringify(next.whitelistRoles)
    ]);
    return next;
  }

  reset(guildId) {
    db.guild.exec("DELETE FROM antinuke_settings WHERE guild_id = ?", [guildId]);
    this.recent.delete(guildId);
    return this.get(guildId);
  }

  mapAction(action) { return ACTION_MAP[action] || null; }

  isProtected(guild, executorId, settings) {
    return !executorId ||
      executorId === guild.client.user?.id ||
      executorId === guild.ownerId ||
      config.ownerIds?.includes(executorId) ||
      settings.whitelistUsers.includes(executorId);
  }

  isWhitelistedMember(member, settings) {
    if (!member) return false;
    return settings.whitelistUsers.includes(member.id) ||
      member.roles.cache.some(role => settings.whitelistRoles.includes(role.id));
  }

  record(guildId, executorId, key, windowMs) {
    const guildMap = this.recent.get(guildId) || new Map();
    this.recent.set(guildId, guildMap);
    const now = Date.now();
    const list = (guildMap.get(executorId) || []).filter(x => now - x.time <= windowMs);
    list.push({ key, time: now });
    guildMap.set(executorId, list);
    return list.filter(x => x.key === key).length;
  }

  clear(guildId, executorId) { this.recent.get(guildId)?.delete(executorId); }

  async punish(guild, executorId, punishment, reason) {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member || member.id === guild.ownerId || member.id === guild.client.user?.id) return { ok: false, reason: "protected" };
    try {
      if (punishment === "ban" && member.bannable) {
        await member.ban({ reason: `LightCore Anti-Nuke: ${reason}` });
        return { ok: true, action: "banned" };
      }
      if (punishment === "kick" && member.kickable) {
        await member.kick(`LightCore Anti-Nuke: ${reason}`);
        return { ok: true, action: "kicked" };
      }
      const me = guild.members.me;
      const removable = member.roles.cache.filter(role =>
        role.id !== guild.id && !role.managed && me && role.position < me.roles.highest.position
      );
      if (removable.size) await member.roles.remove(removable, `LightCore Anti-Nuke: ${reason}`);
      if (member.moderatable) await member.timeout(28 * 24 * 60 * 60 * 1000, `LightCore Anti-Nuke: ${reason}`).catch(() => {});
      return { ok: true, action: removable.size ? "quarantined" : "blocked" };
    } catch (error) {
      return { ok: false, reason: error?.message || "Punishment failed" };
    }
  }

  async sendLog(guild, channelId, data) {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    await channel.send({
      embeds: [{
        color: 0xED4245,
        title: "🛡️ LightCore Anti-Nuke",
        description: data.description,
        fields: data.fields || [],
        footer: { text: "LightCore Security" },
        timestamp: new Date().toISOString()
      }]
    }).catch(() => {});
  }

  formatStatus(settings) {
    return [
      `Status: **${settings.enabled ? "ENABLED" : "DISABLED"}**`,
      `Punishment: **${settings.punishment}**`,
      `Window: **${settings.windowMs / 1000}s**`,
      `Log Channel: ${settings.logChannel ? "<#" + settings.logChannel + ">" : "**Not set**"}`,
      `Whitelisted Users: **${settings.whitelistUsers.length}**`,
      `Whitelisted Roles: **${settings.whitelistRoles.length}**`
    ].join("\n");
  }
}

export const antiNuke = new AntiNuke();
