import { db } from "#database/DatabaseManager";
import { renderAutomationMessage } from "#utils/AutomationUtils";
import { logger } from "#utils/logger";

export default {
  name: "guildMemberAdd",
  async execute(member) {
    if (member.user.bot) return;
    try {
      const setting = db.getWelcome(member.guild.id);
      if (!setting?.enabled) return;
      const channel = member.guild.channels.cache.get(setting.channel_id);
      if (!channel || !channel.isTextBased()) return;
      const content = renderAutomationMessage(setting.message, { member, guild: member.guild, channel });
      await channel.send({ content, allowedMentions: { parse: ["users", "roles"] } });
    } catch (error) {
      logger.error("WelcomeMessage", "Failed to send welcome message:", error);
    }
  },
};
