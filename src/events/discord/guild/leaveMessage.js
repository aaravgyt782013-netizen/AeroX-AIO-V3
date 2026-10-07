import { db } from "#database/DatabaseManager";
import { renderAutomationMessage } from "#utils/AutomationUtils";
import { logger } from "#utils/logger";

export default {
  name: "guildMemberRemove",
  async execute(member) {
    if (member.user.bot) return;
    try {
      const setting = db.getLeave(member.guild.id);
      if (!setting?.enabled) return;

      const channel = member.guild.channels.cache.get(setting.channel_id);
      if (!channel || !channel.isTextBased()) return;

      let inviter = null;
      const inviteData = db.invites?.getMemberInvites?.(member.guild.id, member.id);
      if (inviteData?.inviter_id) {
        inviter = member.guild.members.cache.get(inviteData.inviter_id) || null;
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
      logger.error("LeaveMessage", "Failed to send leave message:", error);
    }
  },
};
