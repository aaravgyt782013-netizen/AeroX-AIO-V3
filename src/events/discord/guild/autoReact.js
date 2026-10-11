import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export default {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild || message.author?.bot || !message.channel?.id) return;

    try {
      if (config.features?.autoReactPremiumOnly !== false && !db.isGuildPremium(message.guild.id)) return;

      const settings = db.getAutoReactions(message.guild.id);
      const reactions = settings[message.channel.id];
      if (!Array.isArray(reactions) || reactions.length === 0) return;

      const me = message.guild.members.me;
      const permissions = message.channel.permissionsFor(me);
      if (!permissions?.has("AddReactions") || !permissions?.has("ReadMessageHistory")) return;

      for (const reaction of reactions.slice(0, 5)) {
        try {
          await message.react(reaction);
        } catch (error) {
          logger.warn("AutoReact", `Could not add reaction "${reaction}" in guild ${message.guild.id}: ${error?.message || error}`);
        }
      }
    } catch (error) {
      logger.error("AutoReact", "Failed to process automatic reactions:", error);
    }
  },
};
