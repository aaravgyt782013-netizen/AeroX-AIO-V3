import { Database } from "#structures/classes/Database";

const XP_MIN = 15;
const XP_MAX = 25;
const MESSAGE_COOLDOWN_MS = 60_000;

export function xpForLevel(level) {
  const safeLevel = Math.max(0, Math.floor(Number(level) || 0));
  return 5 * safeLevel * safeLevel + 50 * safeLevel;
}

export function levelFromXp(xp) {
  const total = Math.max(0, Number(xp) || 0);
  return Math.max(0, Math.floor((-50 + Math.sqrt(2500 + 20 * total)) / 10));
}

class LevelingManager extends Database {
  constructor() {
    super("data/leveling.sqlite");
    this.exec(`
      CREATE TABLE IF NOT EXISTS leveling_members (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        last_xp_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS leveling_rewards (
        guild_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        role_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, level, role_id)
      )
    `);
    this.exec(`
      CREATE TABLE IF NOT EXISTS leveling_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        announcement_channel_id TEXT DEFAULT NULL,
        announcement_text TEXT DEFAULT NULL,
        min_xp INTEGER NOT NULL DEFAULT 15,
        max_xp INTEGER NOT NULL DEFAULT 25,
        cooldown_ms INTEGER NOT NULL DEFAULT 60000
      )
    `);
  }

  ensureMember(guildId, userId) {
    this.exec(
      "INSERT OR IGNORE INTO leveling_members (guild_id, user_id, xp, last_xp_at, updated_at) VALUES (?, ?, 0, 0, ?)",
      [guildId, userId, Date.now()],
    );
  }

  getSettings(guildId) {
    this.exec("INSERT OR IGNORE INTO leveling_settings (guild_id) VALUES (?)", [guildId]);
    return this.get("SELECT * FROM leveling_settings WHERE guild_id = ?", [guildId]);
  }

  configure(guildId, updates = {}) {
    const current = this.getSettings(guildId);
    const next = {
      enabled: updates.enabled ?? current.enabled,
      announcement_channel_id: updates.announcement_channel_id ?? current.announcement_channel_id,
      announcement_text: updates.announcement_text ?? current.announcement_text,
      min_xp: updates.min_xp ?? current.min_xp,
      max_xp: updates.max_xp ?? current.max_xp,
      cooldown_ms: updates.cooldown_ms ?? current.cooldown_ms,
    };
    if (next.min_xp < 0 || next.max_xp < next.min_xp || next.max_xp > 1000) {
      throw new Error("XP range must be between 0 and 1000, with max XP at least min XP.");
    }
    this.exec(
      "UPDATE leveling_settings SET enabled = ?, announcement_channel_id = ?, announcement_text = ?, min_xp = ?, max_xp = ?, cooldown_ms = ? WHERE guild_id = ?",
      [next.enabled ? 1 : 0, next.announcement_channel_id, next.announcement_text, next.min_xp, next.max_xp, next.cooldown_ms, guildId],
    );
    return this.getSettings(guildId);
  }

  awardMessageXp(guildId, userId, timestamp = Date.now()) {
    const settings = this.getSettings(guildId);
    if (!settings.enabled) return { awarded: false, reason: "disabled" };
    this.ensureMember(guildId, userId);
    const member = this.get("SELECT xp, last_xp_at FROM leveling_members WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    if (timestamp - Number(member.last_xp_at || 0) < Number(settings.cooldown_ms || MESSAGE_COOLDOWN_MS)) {
      return { awarded: false, reason: "cooldown" };
    }
    const min = Math.max(0, Number(settings.min_xp ?? XP_MIN));
    const max = Math.max(min, Number(settings.max_xp ?? XP_MAX));
    const amount = Math.floor(min + Math.random() * (max - min + 1));
    const beforeXp = Number(member.xp || 0);
    const beforeLevel = levelFromXp(beforeXp);
    const afterXp = beforeXp + amount;
    const afterLevel = levelFromXp(afterXp);
    this.exec(
      "UPDATE leveling_members SET xp = ?, last_xp_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?",
      [afterXp, timestamp, Date.now(), guildId, userId],
    );
    return { awarded: true, amount, xp: afterXp, previousXp: beforeXp, level: afterLevel, previousLevel: beforeLevel, leveledUp: afterLevel > beforeLevel, settings };
  }

  getRank(guildId, userId) {
    this.ensureMember(guildId, userId);
    const row = this.get("SELECT xp FROM leveling_members WHERE guild_id = ? AND user_id = ?", [guildId, userId]) || { xp: 0 };
    const xp = Math.max(0, Number(row.xp) || 0);
    const level = levelFromXp(xp);
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = xpForLevel(level + 1);
    const rankRow = this.get(
      "SELECT COUNT(*) + 1 AS rank FROM leveling_members WHERE guild_id = ? AND xp > ?",
      [guildId, xp],
    ) || { rank: 1 };
    return {
      xp,
      level,
      rank: Number(rankRow.rank || 1),
      current: xp - currentLevelXp,
      needed: Math.max(1, nextLevelXp - currentLevelXp),
      progress: Math.max(0, Math.min(100, Math.floor(((xp - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp)) * 100))),
    };
  }

  getLeaderboard(guildId, limit = 10, offset = 0) {
    const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    return this.all(
      "SELECT user_id, xp FROM leveling_members WHERE guild_id = ? ORDER BY xp DESC, updated_at ASC LIMIT ? OFFSET ?",
      [guildId, safeLimit, safeOffset],
    ).map((row, index) => ({ ...row, xp: Number(row.xp || 0), level: levelFromXp(row.xp), rank: safeOffset + index + 1 }));
  }

  setXp(guildId, userId, xp) {
    const amount = Math.max(0, Math.min(1_000_000_000, Math.floor(Number(xp) || 0)));
    this.ensureMember(guildId, userId);
    this.exec("UPDATE leveling_members SET xp = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?", [amount, Date.now(), guildId, userId]);
    return this.getRank(guildId, userId);
  }

  addXp(guildId, userId, amount) {
    const current = this.getRank(guildId, userId);
    return this.setXp(guildId, userId, current.xp + Math.floor(Number(amount) || 0));
  }

  resetMember(guildId, userId) {
    this.ensureMember(guildId, userId);
    this.exec("UPDATE leveling_members SET xp = 0, updated_at = ? WHERE guild_id = ? AND user_id = ?", [Date.now(), guildId, userId]);
    return this.getRank(guildId, userId);
  }

  addReward(guildId, level, roleId) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    this.exec("INSERT OR IGNORE INTO leveling_rewards (guild_id, level, role_id) VALUES (?, ?, ?)", [guildId, safeLevel, roleId]);
    return safeLevel;
  }

  removeReward(guildId, level, roleId) {
    if (roleId) return this.exec("DELETE FROM leveling_rewards WHERE guild_id = ? AND level = ? AND role_id = ?", [guildId, level, roleId]);
    return this.exec("DELETE FROM leveling_rewards WHERE guild_id = ? AND level = ?", [guildId, level]);
  }

  getRewards(guildId) {
    return this.all("SELECT level, role_id FROM leveling_rewards WHERE guild_id = ? ORDER BY level ASC", [guildId]);
  }

  async applyRewards(member, level) {
    if (!member?.guild || !member.manageable) return;
    const rewards = this.getRewards(member.guild.id);
    const eligible = rewards.filter((reward) => Number(reward.level) <= level);
    for (const reward of eligible) {
      const role = member.guild.roles.cache.get(reward.role_id) || await member.guild.roles.fetch(reward.role_id).catch(() => null);
      if (role && role.editable && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, "LightCore level reward").catch(() => {});
      }
    }
  }
}

export const leveling = new LevelingManager();
