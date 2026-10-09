import { memberStats } from "#managers/MemberStatsManager";
import { logger } from "#utils/logger";

export default {
  name: "guildMemberRemove",
  async execute(member) {
    try {
      memberStats.recordLeave(member.guild.id);
      await memberStats.refreshGuild(member.guild);
    } catch (error) {
      logger.warn("MemberStats", "Leave counter update failed: " + (error?.message || error));
    }
  },
};
