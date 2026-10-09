import { memberStats } from "#managers/MemberStatsManager";
import { leveling } from "#managers/LevelingManager";
import { logger } from "#utils/logger";

export default {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild || message.author?.bot || !message.author?.id) return;
    try {
      memberStats.recordMessage(message.guild.id, message.author.id, message.channelId, message.createdTimestamp);
      const result = leveling.awardMessageXp(message.guild.id, message.author.id, message.createdTimestamp);
      if (result.leveledUp) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) await leveling.applyRewards(member, result.level);
        const configuredChannelId = result.settings?.announcement_channel_id;
        const target = configuredChannelId
          ? await message.guild.channels.fetch(configuredChannelId).catch(() => null)
          : message.channel;
        if (target?.isTextBased?.()) {
          const template = result.settings?.announcement_text;
          const announcement = template
            ? template.replaceAll("{user}", `<@${message.author.id}>`).replaceAll("{username}", message.author.username).replaceAll("{level}", String(result.level)).replaceAll("{xp}", result.xp.toLocaleString("en-US"))
            : `🎉 <@${message.author.id}> reached **Level ${result.level}**! (+${result.amount} XP)`;
          await target.send({ content: announcement, allowedMentions: { users: [message.author.id] } }).catch(() => {});
        }
      }
      await memberStats.refreshGuild(message.guild);
    } catch (error) {
      logger.warn("MemberStats", "Message activity tracking failed: " + (error?.message || error));
    }
  },
};
