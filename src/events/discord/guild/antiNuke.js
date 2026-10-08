import { antiNuke } from "#utils/AntiNuke";
import { logger } from "#utils/logger";

const actionLabels = {
  channelDelete: "channel deletion",
  channelCreate: "channel creation",
  roleDelete: "role deletion",
  roleCreate: "role creation",
  memberBan: "member ban",
  memberKick: "member kick",
  webhook: "webhook change",
  botAdd: "bot addition",
  emojiDelete: "emoji deletion",
  stickerDelete: "sticker deletion",
  integration: "integration change",
  guildUpdate: "guild/AutoMod change",
  memberRoleUpdate: "member role change"
};

export default {
  name: "guildAuditLogEntryCreate",
  async execute(entry, guild) {
    try {
      if (!guild || !entry?.action) return;

      const settings = antiNuke.get(guild.id);
      if (!settings.enabled) return;

      const key = antiNuke.mapAction(entry.action);
      if (!key) return;

      const executorId = entry.executorId || entry.executor?.id;
      if (antiNuke.isProtected(guild, executorId, settings)) return;

      const member = await guild.members.fetch(executorId).catch(() => null);
      if (antiNuke.isWhitelistedMember(member, settings)) return;

      const count = antiNuke.record(guild.id, executorId, key, settings.windowMs);
      const threshold = Number(settings.thresholds[key] || 3);
      if (count < threshold) return;

      const label = actionLabels[key] || key;
      const reason = "threshold reached for " + label + " (" + count + " actions in " + (settings.windowMs / 1000) + "s)";
      const result = await antiNuke.punish(guild, executorId, settings.punishment, reason);
      antiNuke.clear(guild.id, executorId);

      await antiNuke.sendLog(guild, settings.logChannel, {
        description: result.ok
          ? "A destructive action pattern was detected and the executor was contained."
          : "A destructive action pattern was detected, but the configured punishment could not fully execute.",
        fields: [
          { name: "Executor", value: "<@" + executorId + ">", inline: true },
          { name: "Action", value: label, inline: true },
          { name: "Threshold", value: String(threshold), inline: true },
          { name: "Punishment", value: result.action || settings.punishment, inline: true },
          { name: "Result", value: result.ok ? "Protected" : (result.reason || "Failed"), inline: true }
        ]
      });

      logger.warn("AntiNuke", "Triggered in " + guild.name + " for " + executorId + ": " + reason);
    } catch (error) {
      logger.error("AntiNuke", "Audit-log protection error", error);
    }
  }
};
