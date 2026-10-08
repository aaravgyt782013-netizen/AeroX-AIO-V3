import { PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { LoggingManager } from "#managers/LoggingManager";
import { logger } from "#utils/logger";

export default {
  name: "messageCreate",
  async execute(message, client) {
    if (!message.guild || message.webhookId || message.author.id === client.user?.id) return;
    const settings = db.guild.getHoneypotSettings(message.guild.id);
    if (!settings.channelId || message.channelId !== settings.channelId) return;

    try {
      if (message.deletable) await message.delete().catch(() => null);
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      const privileged = member?.permissions?.has(PermissionFlagsBits.Administrator) || member?.permissions?.has(PermissionFlagsBits.ManageGuild);

      if (!message.author.bot) {
        await LoggingManager.send(message.guild, "automod", {
          title: "Honeypot human trigger", emoji: "🍯", color: 0xF1C40F,
          description: "A human posted in the honeypot. The message was removed and no punishment was applied.",
          action: "HONEYPOT_HUMAN", target: message.author.tag + " (" + message.author.id + ")", executor: "LightCore", channel: "<#" + message.channelId + ">",
        });
        return;
      }

      if (privileged) {
        await LoggingManager.send(message.guild, "automod", {
          title: "Honeypot bypass", emoji: "🍯", color: 0xF1C40F,
          description: "A privileged account triggered the honeypot, so punishment was skipped.",
          action: "HONEYPOT_BYPASS", target: message.author.tag + " (" + message.author.id + ")", executor: "LightCore", channel: "<#" + message.channelId + ">",
        });
        return;
      }

      let result = "logged";
      if (settings.action === "ban" && member?.bannable) {
        await member.ban({ deleteMessageSeconds: 86400, reason: "LightCore Honeypot: bot trap triggered" });
        result = "banned";
      } else if (settings.action === "kick" && member?.kickable) {
        await member.kick("LightCore Honeypot: bot trap triggered");
        result = "kicked";
      } else if (settings.action === "timeout" && member?.moderatable) {
        await member.timeout(60 * 60 * 1000, "LightCore Honeypot: bot trap triggered");
        result = "timed out";
      } else {
        logger.warn("Honeypot", "Could not " + settings.action + " bot " + message.author.id + ". Check role hierarchy and permissions.");
        result = "could not " + settings.action;
      }

      await LoggingManager.send(message.guild, "automod", {
        title: "Honeypot triggered", emoji: "🍯", color: result === "banned" ? 0xED4245 : 0xF1C40F,
        description: "A bot account triggered the honeypot and was **" + result + "**.",
        action: "HONEYPOT_" + result.toUpperCase().replace(/\s+/g, "_"), target: message.author.tag + " (" + message.author.id + ")", executor: "LightCore", channel: "<#" + message.channelId + ">",
        fields: [{ name: "Configured action", value: settings.action, inline: true }],
      });
    } catch (error) {
      logger.error("Honeypot", "Failed to process honeypot trigger", error);
    }
  },
};