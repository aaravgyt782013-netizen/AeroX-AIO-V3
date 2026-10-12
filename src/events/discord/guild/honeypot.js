import { db } from "#database/DatabaseManager";
import { LoggingManager } from "#managers/LoggingManager";
import { logger } from "#utils/logger";

export default {
  name: "messageCreate",
  async execute(message, client) {
    if (!message.guild || message.author.id === client.user?.id) return;
    const settings = db.guild.getHoneypotSettings(message.guild.id);
    if (!settings.channelId || message.channelId !== settings.channelId) return;

    let result = "punishment failed";
    let member = null;
    try {
      // Delete the trap message first, whether it came from a human, bot, or webhook.
      if (message.deletable) await message.delete().catch(error => logger.warn("Honeypot", "Could not delete trigger message; check Manage Messages permission.", error));
      member = await message.guild.members.fetch(message.author.id).catch(() => null);

      // Apply the configured punishment to every guild member who triggers the trap.
      // Webhook identities without a guild member can have their message deleted but cannot be punished.
      if (member) {
        if (settings.action === "ban" && member.bannable) {
          await member.ban({ deleteMessageSeconds: 86400, reason: "LightCore Honeypot: configured trap channel triggered" });
          result = "banned";
        } else if (settings.action === "kick" && member.kickable) {
          await member.kick("LightCore Honeypot: configured trap channel triggered");
          result = "kicked";
        } else if (settings.action === "timeout" && member.moderatable) {
          await member.timeout(60 * 60 * 1000, "LightCore Honeypot: configured trap channel triggered");
          result = "timed out";
        } else {
          result = "could not " + settings.action + " (role hierarchy or permissions)";
        }
      } else {
        result = "message deleted; no guild member to punish";
      }

      await LoggingManager.send(message.guild, "automod", {
        title: "Honeypot triggered",
        emoji: "🍯",
        color: result === "banned" ? 0xED4245 : 0xF1C40F,
        description: "An account posted in the configured honeypot channel. The configured action result was: **" + result + "**.",
        action: "HONEYPOT_" + result.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        target: message.author.tag + " (" + message.author.id + ")",
        executor: "LightCore",
        channel: "<#" + message.channelId + ">",
        fields: [{ name: "Configured action", value: settings.action, inline: true }],
      });
    } catch (error) {
      logger.error("Honeypot", "Failed to process honeypot trigger", error);
      await LoggingManager.send(message.guild, "automod", {
        title: "Honeypot action failed",
        emoji: "🍯",
        color: 0xED4245,
        description: "A message triggered the honeypot, but an action failed. Check the bot permissions and role hierarchy.",
        action: "HONEYPOT_ERROR",
        target: message.author.tag + " (" + message.author.id + ")",
        executor: "LightCore",
        channel: "<#" + message.channelId + ">",
      }).catch(() => {});
    }
  },
};
