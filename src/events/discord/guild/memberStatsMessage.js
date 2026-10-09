import { memberStats } from "#managers/MemberStatsManager";
import { logger } from "#utils/logger";

export default {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild || message.author?.bot || !message.author?.id) return;
    try {
      memberStats.recordMessage(message.guild.id, message.author.id, message.channelId, message.createdTimestamp);
      await memberStats.refreshGuild(message.guild);
    } catch (error) {
      logger.warn("MemberStats", "Message activity tracking failed: " + (error?.message || error));
    }
  },
};
