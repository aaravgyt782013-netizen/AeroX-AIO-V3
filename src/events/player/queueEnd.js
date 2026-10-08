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
      const mode247 = Boolean(settings.mode247);

      // Components V2 messages cannot use legacy content/embeds.
      // More importantly, autoplay is a permanent stay-alive mode:
      // never schedule the normal 60-second queue-empty disconnect.
      if (autoplay) {
        player.set("autoplayEnabled", true);
        player.set("stayAlive", true);
        await startAutoplay(player, track, client);
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
          description: "All queued songs have finished. Use **.play <song>** to start another session.",
          accent: 0x5865F2
        })
      ));

      const timeout = setTimeout(async () => {
        try {
          const current = db.guild.getMusicSettings(player.guildId);
          const humanMembers = client.guilds.cache
            .get(player.guildId)?.channels.cache
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
    (player.queue.previous || []).slice(0, 20)
      .map(item => item?.info?.identifier)
      .filter(Boolean)
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
    logger.warn("QueueEnd", `Autoplay could not find a follow-up for "${lastTrack.info.title}"`);
    return;
  }

  const candidates = result.tracks.filter(t => t?.info?.identifier && !previousIds.has(t.info.identifier));
  const next = candidates[0] || result.tracks[0];
  if (!next) return;

  try {
    await player.queue.add(next);
    if (!player.playing) await player.play();
    await EventUtils.sendPlayerMessage(client, player, v2Payload(
      musicContainer({
        title: "🔄 LIGHTCORE • AUTOPLAY",
        description: `Found the next track automatically.

🎵 **${next.info.title || "Unknown"}**
👤 ${next.info.author || "Unknown artist"}`,
        accent: 0x57F287
      })
    ));
    logger.info("QueueEnd", `Autoplay queued "${next.info.title}" in guild ${player.guildId}`);
  } catch (error) {
    logger.error("QueueEnd", "Failed to queue autoplay track:", error);
  }
}
