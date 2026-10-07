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

      let inviter = null;
      const inviteData = db.invites?.getMemberInvites?.(member.guild.id, member.id);
      if (inviteData?.inviter_id) {
        inviter = member.guild.members.cache.get(inviteData.inviter_id) ||
          await member.guild.members.fetch(inviteData.inviter_id).catch(() => null);
      }

      const content = renderAutomationMessage(setting.message, {
        member,
        guild: member.guild,
        channel,
        inviter,
      });

      await channel.send({
        content,
        allowedMentions: { parse: ["users", "roles"] },
      });
    } catch (error) {
      logger.error("WelcomeMessage", "Failed to send welcome message:", error);
    }
  },
};
