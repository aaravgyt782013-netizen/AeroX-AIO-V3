import { logger } from "#utils/logger";
import { db } from "#database/DatabaseManager";
import { EventUtils } from "#utils/EventUtils";
import { musicContainer, v2Payload } from "#utils/MusicCore";

export default {
  name: "queueEnd",
  once: false,

  async execute(player, track, payload, musicManager, client) {
    try {
      EventUtils.clearPlayerTimeout(player, "disconnectTimeoutId");
      EventUtils.clearPlayerTimeout(player, "stuckTimeoutId");

      const settings = db.guild.getMusicSettings(player.guildId);
      const autoplay = Boolean(player.get("autoplayEnabled") ?? settings.autoplay);
      const mode247 = Boolean(player.get("stay247") ?? settings.mode247);
      const lastTrack = track || player.get("lastPlayedTrack");

      if (autoplay) {
        player.set("autoplayEnabled", true);
        player.set("stayAlive", true);
        player.set("stay247", mode247);
        await startAutoplay(player, lastTrack, client);
        return;
      }

      if (mode247) {
        player.set("stayAlive", true);
        await EventUtils.sendPlayerMessage(client, player, v2Payload(
          musicContainer({
            title: "♾️ LIGHTCORE • 24/7",
            description: "The queue is empty, but 24/7 mode is keeping the voice connection alive.",
            accent: 0x5865F2
          })
        ));
        return;
      }

      await EventUtils.sendPlayerMessage(client, player, v2Payload(
        musicContainer({
          title: "🏁 LIGHTCORE • QUEUE COMPLETE",
          description: "All queued songs have finished. Use .play <song> to start another session.",
          accent: 0x5865F2
        })
      ));

      const timeout = setTimeout(async () => {
        try {
          const current = db.guild.getMusicSettings(player.guildId);
          const humanMembers = client.guilds.cache.get(player.guildId)?.channels.cache
            .get(player.voiceChannelId)?.members
            ?.filter(member => !member.user.bot).size ?? 0;

          if (!current.autoplay && !current.mode247 && humanMembers === 0 &&
              !player.queue.current && player.queue.tracks.length === 0) {
            await player.destroy("Queue empty and voice channel unused", true).catch(() => {});
          }
        } catch (error) {
          logger.warn("QueueEnd", "Auto-disconnect check failed: " + (error?.message || error));
        }
      }, 60000);

      player.set("disconnectTimeoutId", timeout);
    } catch (error) {
      logger.error("QueueEnd", "Queue-end handler failed:", error);
    }
  }
};

async function startAutoplay(player, lastTrack, client) {
  if (!lastTrack?.info?.title) return;

  const base = [lastTrack.info.author, lastTrack.info.title].filter(Boolean).join(" ");
  const previousIds = new Set(
    (player.queue.previous || []).slice(0, 30).map(item => item?.info?.identifier).filter(Boolean)
  );

  let result = null;
  for (const source of ["ytmsearch", "ytsearch"]) {
    try {
      result = await client.music.search(base, { source });
      if (result?.tracks?.length) break;
    } catch (error) {
      logger.warn("QueueEnd", "Autoplay search failed: " + (error?.message || error));
    }
  }

  if (!result?.tracks?.length) {
    logger.warn("QueueEnd", "Autoplay found no follow-up for " + lastTrack.info.title);
    scheduleAutoplayRetry(player, lastTrack, client);
    return;
  }

  const candidates = result.tracks.filter(t => t?.info?.identifier && !previousIds.has(t.info.identifier));
  const next = candidates[0] || result.tracks[0];
  if (!next) {
    scheduleAutoplayRetry(player, lastTrack, client);
    return;
  }

  try {
    await player.queue.add(next);
    if (!player.playing) await player.play();

    await EventUtils.sendPlayerMessage(client, player, v2Payload(
      musicContainer({
        title: "🔄 LIGHTCORE • AUTOPLAY",
        description: "Next track found automatically.\n\n🎵 **" + (next.info.title || "Unknown") + "**\n👤 " + (next.info.author || "Unknown artist"),
        accent: 0x57F287
      })
    ));
  } catch (error) {
    logger.error("QueueEnd", "Failed to queue autoplay track:", error);
    scheduleAutoplayRetry(player, lastTrack, client);
  }
}

function scheduleAutoplayRetry(player, lastTrack, client) {
  if (player.get("autoplayRetryTimer")) return;

  const timer = setTimeout(async () => {
    player.set("autoplayRetryTimer", null);
    if (!player.get("autoplayEnabled")) return;
    if (player.queue.current || player.queue.tracks.length) return;
    await startAutoplay(player, lastTrack, client);
  }, 15000);

  player.set("autoplayRetryTimer", timer);
}
