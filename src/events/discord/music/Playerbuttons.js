import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

const MUSIC_IDS = new Set([
  "music_previous", "music_pause", "music_skip", "music_stop",
  "music_player_select", "music_controls_select",
]);

const replyV2 = (interaction, container, ephemeral = true) => {
  const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
  if (ephemeral) payload.flags |= MessageFlags.Ephemeral;
  return interaction.replied || interaction.deferred
    ? interaction.editReply(payload)
    : interaction.reply(payload);
};

const resultBox = (title, text) => {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return c;
};

export default {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (!MUSIC_IDS.has(interaction.customId)) return;

    try {
      if (!interaction.guild) return;
      const player = client.music?.getPlayer(interaction.guild.id);
      if (!player) return replyV2(interaction, resultBox("Music", "No music player is active in this server."));

      const pm = new PlayerManager(player);
      if (!interaction.member?.voice?.channelId) {
        return replyV2(interaction, resultBox("Music", "Join the bot's voice channel first."));
      }
      if (pm.voiceChannelId && interaction.member.voice.channelId !== pm.voiceChannelId) {
        return replyV2(interaction, resultBox("Music", "You must be in the same voice channel as LightCore."));
      }

      const settings = db.guild.getMusicSettings(interaction.guild.id);
      const isAdmin = interaction.member.permissions?.has("Administrator");
      const isDJ = settings.djRole && interaction.member.roles?.cache?.has(settings.djRole);
      if (settings.djRole && !isAdmin && !isDJ) {
        return replyV2(interaction, resultBox("DJ Control", "You need the configured DJ role to control the player."));
      }

      if (interaction.isButton()) {
        await handleButton(interaction, pm);
      } else {
        await handleSelect(interaction, pm, interaction.guild.id);
      }
    } catch (error) {
      logger.error("MusicPlayer", `Control error: ${error.message}`);
      if (!interaction.replied && !interaction.deferred) {
        await replyV2(interaction, resultBox("Music", "Something went wrong while processing that control.")).catch(() => {});
      }
    }
  },
};

async function handleButton(i, pm) {
  switch (i.customId) {
    case "music_previous":
      return replyV2(i, resultBox("Previous", await pm.playPrevious() ? "Playing the previous track." : "There is no previous track."));
    case "music_pause":
      if (!pm.hasCurrentTrack) return replyV2(i, resultBox("Pause", "Nothing is currently playing."));
      if (pm.isPaused) { await pm.resume(); return replyV2(i, resultBox("Playback", "▶️ Music resumed.")); }
      await pm.pause(); return replyV2(i, resultBox("Playback", "⏸️ Music paused."));
    case "music_skip":
      if (!pm.hasCurrentTrack) return replyV2(i, resultBox("Skip", "Nothing is currently playing."));
      { const title = pm.currentTrack.info.title; await pm.skip(); return replyV2(i, resultBox("Skip", `⏭️ Skipped **${title}**.`)); }
    case "music_stop":
      await pm.stop(); return replyV2(i, resultBox("Stop", "⏹️ Playback stopped and the queue was cleared."));
  }
}

async function handleSelect(i, pm, guildId) {
  const value = i.values[0];
  switch (value) {
    case "queue": {
      const tracks = pm.queue.tracks.slice(0, 10);
      const body = tracks.length
        ? tracks.map((t, n) => `**${n + 1}.** ${t.info.title} — ${t.info.author || "Unknown"}`).join("\n")
        : "The queue is empty.";
      return replyV2(i, resultBox("Queue", body));
    }
    case "shuffle":
      if (!pm.queueSize) return replyV2(i, resultBox("Shuffle", "The queue is empty."));
      await pm.shuffleQueue(); return replyV2(i, resultBox("Shuffle", "🔀 Queue shuffled."));
    case "loop_off":
      await pm.setRepeatMode("off"); return replyV2(i, resultBox("Loop", "Repeat disabled."));
    case "loop_track":
      await pm.setRepeatMode("track"); return replyV2(i, resultBox("Loop", "🔂 Current track will repeat."));
    case "loop_queue":
      await pm.setRepeatMode("queue"); return replyV2(i, resultBox("Loop", "🔁 Queue repeat enabled."));
    case "volume_down": {
      const v = Math.max(1, pm.volume - 10); await pm.setVolume(v);
      return replyV2(i, resultBox("Volume", `🔉 Volume set to **${v}%**.`));
    }
    case "volume_up": {
      const v = Math.min(100, pm.volume + 10); await pm.setVolume(v);
      return replyV2(i, resultBox("Volume", `🔊 Volume set to **${v}%**.`));
    }
    case "autoplay": {
      const s = db.guild.getMusicSettings(guildId);
      db.guild.setAutoplay(guildId, !s.autoplay);
      pm.setData("autoplayEnabled", !s.autoplay);
      return replyV2(i, resultBox("Autoplay", `🔄 Autoplay **${!s.autoplay ? "enabled" : "disabled"}**.`));
    }
    case "settings":
      return replyV2(i, resultBox("Music Settings", "Use the music settings command to configure DJ, autoplay, announcements, 24/7 and volume."));
    default:
      return replyV2(i, resultBox("Music", "Unknown control."));
  }
}

export function createMusicPlayerComponents(settings, paused = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("music_player_select")
    .setPlaceholder("🎛️ Music controls")
    .addOptions(
      { label: "Queue", description: "View the next tracks", value: "queue", emoji: "📜" },
      { label: "Shuffle", description: "Shuffle the queue", value: "shuffle", emoji: "🔀" },
      { label: "Loop Off", description: "Disable repeat", value: "loop_off", emoji: "➡️" },
      { label: "Loop Track", description: "Repeat current track", value: "loop_track", emoji: "🔂" },
      { label: "Loop Queue", description: "Repeat the queue", value: "loop_queue", emoji: "🔁" },
      { label: "Volume Down", description: "Lower volume", value: "volume_down", emoji: "🔉" },
      { label: "Volume Up", description: "Raise volume", value: "volume_up", emoji: "🔊" },
      { label: "Autoplay", description: "Toggle autoplay", value: "autoplay", emoji: "🔄" },
      { label: "Settings", description: "Music server settings", value: "settings", emoji: "⚙️" },
    );

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("music_previous").setEmoji("⏮️").setLabel("Previous").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("music_pause").setEmoji(paused ? "▶️" : "⏸️").setLabel(paused ? "Resume" : "Pause").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("music_skip").setEmoji("⏭️").setLabel("Skip").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("music_stop").setEmoji("⏹️").setLabel("Stop").setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function createMusicPlayerV2(track, settings, paused = false, position = 0) {
  const title = track?.info?.title || "Unknown title";
  const author = track?.info?.author || "Unknown artist";
  const duration = track?.info?.duration ? formatDuration(track.info.duration) : "LIVE";
  const source = track?.info?.sourceName || "Unknown";
  const current = track?.info?.duration ? formatDuration(position) : "LIVE";

  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent("## 🎵 LightCore Music Player"));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**[${title}](${track?.info?.uri || "https://discord.com"})**\n🎤 ${author}\n⏱️ ${current} / ${duration}  •  🎶 ${source}`
  ));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `🔄 Autoplay: **${settings.autoplay ? "ON" : "OFF"}**  •  👑 DJ: **${settings.djRole ? "ON" : "OFF"}**\n📢 Announcements: **${settings.announceSongs ? "ON" : "OFF"}**  •  ⏯️ **${paused ? "Paused" : "Playing"}**`
  ));
  for (const row of createMusicPlayerComponents(settings, paused)) c.addActionRowComponents(row);
  return c;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "LIVE";
  const s = Math.floor(ms / 1000);
  const sec = String(s % 60).padStart(2, "0");
  const min = Math.floor(s / 60) % 60;
  const hr = Math.floor(s / 3600);
  return hr ? `${hr}:${String(min).padStart(2, "0")}:${sec}` : `${min}:${sec}`;
}
