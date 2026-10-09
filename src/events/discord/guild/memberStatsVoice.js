import { memberStats } from "#managers/MemberStatsManager";
import { logger } from "#utils/logger";

export default {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    // Only count time connected to a real voice channel; transitions between
    // channels keep the session running without double-counting.
    try {
      if (!oldChannel && newChannel) {
        memberStats.startVoice(guildId, member.id);
      } else if (oldChannel && !newChannel) {
        memberStats.stopVoice(guildId, member.id);
      }
      if (oldChannel?.id !== newChannel?.id) {
        await memberStats.refreshGuild(newState.guild || oldState.guild);
      }
    } catch (error) {
      logger.warn("MemberStats", "Voice activity tracking failed: " + (error?.message || error));
    }
  },
};
