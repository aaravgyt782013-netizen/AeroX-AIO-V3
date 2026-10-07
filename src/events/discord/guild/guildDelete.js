import { logger } from "#utils/logger";
import { config } from "#config/config";

// FIX: Clean up inviteCache when bot leaves a guild to prevent memory leak.
// Previously, invite cache entries were never removed when the bot left a guild.
export default {
  name: "guildDelete",
  async execute(guild, client) {
    try {
      const clientId = config.clientId || client.user?.id;
      const invite = clientId
        ? "https://discord.com/oauth2/authorize?client_id=" + clientId + "&scope=bot%20applications.commands&permissions=8"
        : config.links?.supportServer;
      const targets = [];
      if (guild.ownerId) {
        const owner = guild.members.cache.get(guild.ownerId) || await guild.members.fetch(guild.ownerId).catch(() => null);
        if (owner?.user) targets.push(owner.user);
      }
      for (const [, member] of guild.members.cache) {
        if (member.user.bot || !member.permissions.has("Administrator") || targets.some(u => u.id === member.id)) continue;
        targets.push(member.user);
        if (targets.length >= 10) break;
      }
      const message =
        "🚨 **LightCore was removed from " + guild.name + "**\n\n" +
        "The bot was kicked or removed from this server.\n\n" +
        "🔗 **Re-add LightCore:** " + invite + "\n\n" +
        "If this was intentional, no action is required.";
      for (const user of targets) await user.send(message).catch(() => null);
      logger.warn("GuildDelete", "LightCore was removed from " + guild.name + " (" + guild.id + ")");
    } catch (error) {
      logger.error("GuildDelete", "Failed to notify server administration after removal:", error);
    }

    if (client.inviteCache?.has(guild.id)) {
      client.inviteCache.delete(guild.id);
      logger.debug("GuildDelete", `Cleaned invite cache for guild ${guild.id} (${guild.name})`);
    }
  },
};
