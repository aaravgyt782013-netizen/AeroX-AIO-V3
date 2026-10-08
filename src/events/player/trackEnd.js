import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";

export default {
  name: "trackEnd",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      EventUtils.clearPlayerTimeout(player, "stuckTimeoutId");

      // Components V2 messages cannot be edited with legacy content or embeds.
      // The next track-start event will create the fresh music panel.
      const messageId = player.get("nowPlayingMessageId");
      const channelId = player.get("nowPlayingChannelId");

      if (messageId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const message = await channel?.messages.fetch(messageId).catch(() => null);
          if (message) await message.delete().catch(() => {});
        } catch {}
      }

      player.set("nowPlayingMessageId", null);
      player.set("nowPlayingChannelId", null);
      player.set("stuckWarningMessageId", null);
      player.set("errorMessageId", null);
      player.set("stuckTimeoutId", null);

      if (payload?.reason === "FINISHED" && track?.info?.title) {
        logger.info("TrackEnd", `Finished "${track.info.title}" in guild ${player.guildId}`);
      }
    } catch (error) {
      logger.error("TrackEnd", "Track-end handler failed:", error);
    }
  }
};
