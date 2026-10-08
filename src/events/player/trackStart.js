import { MessageFlags } from "discord.js";
import { EventUtils } from "#utils/EventUtils";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import { createMusicPlayerV2 } from "#events/discord/music/Playerbuttons";

export default {
  name: "trackStart",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      if (!track?.info) {
        logger.warn("TrackStart", "Ignoring invalid track payload.");
        return;
      }

      player.set("lastPlayedTrack", track);
      player.set("sessionStartTime", player.get("sessionStartTime") || Date.now());
      player.set("totalTracksPlayed", (player.get("totalTracksPlayed") || 0) + 1);

      if (track.requester?.id && track.info.identifier) {
        try {
          db.user.addTrackToHistory(track.requester.id, track.info);
        } catch (error) {
          logger.debug("TrackStart", "History write failed: " + (error?.message || error));
        }
      }

      const settings = db.guild.getMusicSettings(player.guildId);
      if (settings.announceSongs === false) {
        player.set("nowPlayingMessageId", null);
        player.set("nowPlayingChannelId", player.textChannelId);
        return;
      }

      // Pure Components V2: no content/embeds are mixed into this message.
      const message = await EventUtils.sendPlayerMessage(client, player, {
        components: createMusicPlayerV2(track, settings, false, 0),
        flags: MessageFlags.IsComponentsV2
      });

      if (message?.id) {
        player.set("nowPlayingMessageId", message.id);
        player.set("nowPlayingChannelId", player.textChannelId);
      }

      logger.info("TrackStart", `Now playing "${track.info.title}" in guild ${player.guildId}`);
    } catch (error) {
      logger.error("TrackStart", "Track-start handler failed:", error);
    }
  }
};
