import { memberStats } from "#managers/MemberStatsManager";
import { logger } from "#utils/logger";

export default {
  name: "guildMemberAdd",
  async execute(member) {
    try {
      memberStats.recordJoin(member.guild.id);
      await memberStats.refreshGuild(member.guild, true);
    } catch (error) {
      logger.warn("MemberStats", "Join counter update failed: " + (error?.message || error));
    }
  },
};
