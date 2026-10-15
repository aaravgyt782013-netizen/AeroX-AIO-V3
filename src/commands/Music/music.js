import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} from "discord.js";
import { config } from "#config/config";
import { searchWithFallback } from "#managers/music/MusicPlaybackService";
import { openMusicPanel } from "./panel.js";

const COLORS = { primary: 0x5865F2, success: 0x57F287, warning: 0xFEE75C, danger: 0xED4245 };
const clean = (value, max = 180) => String(value ?? "").replace(/[@\\*_~`]/g, "").replace(/[\r\n]/g, " ").slice(0, max);
const titleOf = track => clean(track?.info?.title || "Unknown track");
const duration = ms => {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return "LIVE";
  const seconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : minutes + ":" + String(seconds % 60).padStart(2, "0");
};
const card = (title, description, color = COLORS.primary) => new EmbedBuilder()
  .setColor(color).setTitle(title).setDescription(String(description || "No details available.").slice(0, 3900))
  .setFooter({ text: "LightCore • Music" }).setTimestamp();

function voiceError(message, player, settings) {
  const voice = message.member?.voice?.channel;
  if (!voice) return "Join a voice channel before using music commands.";
  if (settings.allowedVoiceChannelId && voice.id !== settings.allowedVoiceChannelId) return "Music is restricted to <#" + settings.allowedVoiceChannelId + ">.";
  if (player?.voiceChannelId && player.voiceChannelId !== voice.id) return "LightCore is already connected to another voice channel.";
  const perms = voice.permissionsFor(message.guild.members.me);
  if (!perms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return "I need Connect and Speak permissions in your voice channel.";
  return null;
}

function djError(message, settings, destructive = false) {
  if (destructive && message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
  if (settings.djRoleId && !message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !message.member.roles.cache.has(settings.djRoleId)) {
    return "You need the configured DJ role <@&" + settings.djRoleId + "> to control music.";
  }
  if (destructive && !settings.djRoleId && !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return "This action requires Manage Server or a configured DJ role.";
  }
  return null;
}

async function searchPicker({ message, tracks, query, manager, player }) {
  const shown = tracks.slice(0, 5);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("lightcore_search:select")
    .setPlaceholder("Choose a track to play")
    .addOptions(shown.map((track, index) => ({
      label: titleOf(track).slice(0, 95),
      description: (clean(track.info?.author || "Unknown artist", 60) + " • " + duration(track.info?.duration)).slice(0, 100),
      value: String(index)
    })));
  const sent = await message.reply({
    embeds: [card("🔎 Search results", "**Query:** " + clean(query, 150) + "\nChoose one of the results below.\n\n" + shown.map((track, index) => "**" + (index + 1) + ".** " + titleOf(track) + " · " + duration(track.info?.duration)).join("\n"))],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
  const collector = sent.createMessageComponentCollector({ time: 90000 });
  collector.on("collect", async interaction => {
    if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Only the person who started this search can choose a result.", ephemeral: true }).catch(() => {});
    const freshMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const freshPlayer = manager.getPlayer(message.guild.id) || player;
    if (!freshMember?.voice.channel || (freshPlayer.voiceChannelId && freshMember.voice.channel.id !== freshPlayer.voiceChannelId)) {
      return interaction.reply({ content: "Join the same voice channel as LightCore to select a result.", ephemeral: true }).catch(() => {});
    }
    const selected = shown[Number(interaction.values[0])];
    if (!selected) return interaction.reply({ content: "That result expired. Search again.", ephemeral: true }).catch(() => {});
    try {
      const settings = manager.getSettings(message.guild.id);
      const { addTracks } = await import("#managers/music/MusicPlaybackService");
      const wasActive = Boolean(freshPlayer.queue?.current || freshPlayer.playing || freshPlayer.paused);
      const result = await addTracks(freshPlayer, [selected], settings.maxQueue);
      if (!result.accepted) return interaction.reply({ content: "The queue is full.", ephemeral: true });
      await interaction.update({
        embeds: [card("✅ Added to queue", "**" + titleOf(selected) + "** · " + duration(selected.info?.duration), COLORS.success)],
        components: []
      });
      collector.stop("selected");
      if (!wasActive) await manager.publishPlayer(freshPlayer, selected).catch(() => {});
    } catch (error) {
      await interaction.reply({ content: "Could not play that result: " + clean(error?.message || error), ephemeral: true }).catch(() => {});
    }
  });
  collector.on("end", (_, reason) => {
    if (reason !== "limit") sent.edit({ components: [] }).catch(() => {});
  });
}

export default {
  name: "music",
  aliases: ["m", "player"],
  description: "Unified LightCore music system: playback, queue, controls and server settings.",
  usage: "music <play|search|pause|resume|skip|back|stop|queue|volume|shuffle|remove|clear|seek|loop|autoplay|config|panel|help>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],

  async execute({ client, message, args = [] }) {
    if (!message.guild || !message.member) return;
    const manager = client.music;
    if (!manager) return message.reply("The music engine is still starting. Try again shortly.");
    const guildId = message.guild.id;
    const settings = manager.getSettings(guildId);
    const sub = String(args.shift() || "panel").toLowerCase();
    const player = manager.getPlayer(guildId);
    const reply = (title, description, color = COLORS.primary) => message.reply({ embeds: [card(title, description, color)] });
    const fail = text => reply("⚠️ Music action unavailable", text, COLORS.danger);

    if (!config.music.enabled) return fail("Music is disabled by the bot owner.");
    if (["panel", "dashboard", "setup", "musicpanel"].includes(sub)) return openMusicPanel({ client, message });
    if (sub === "help") return reply("🎧 LightCore Music", [
      "**Playback**  `.play <song or URL>` · `.search <query>` · `.pause` · `.resume` · `.skip` · `.back` · `.stop`",
      "**Queue**  `.queue [page]` · `.shuffle` · `.remove <position>` · `.clear`",
      "**Controls**  `.volume <0-100>` · `.seek <seconds>` · `.loop <off|track|queue>` · `.autoplay <on|off>`",
      "**Settings**  `.musicsetting` · `.music config`",
      "Music requires a reachable Lavalink v4 node with a compatible source plugin."
    ].join("\n\n"));
    if (!manager.lavalink || !manager.lavalink.useable) return fail("No Lavalink node is available. Check the Render host, port, TLS and authorization settings.");

    if (sub === "config") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return fail("Manage Server permission is required to change music settings.");
      const key = String(args.shift() || "").toLowerCase();
      const value = args.join(" ").trim().toLowerCase();
      if (!key) return reply("⚙️ Server music settings", [
        "**Default volume:** " + settings.defaultVolume + "%",
        "**Queue limit:** " + settings.maxQueue,
        "**DJ role:** " + (settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Not set"),
        "**Search source:** " + settings.defaultSource,
        "**Repeat:** " + settings.loop,
        "**Autoplay:** " + (settings.autoplay ? "On" : "Off"),
        "**Requests channel:** " + (settings.requestChannelId ? "<#" + settings.requestChannelId + ">" : "Any channel"),
        "Use `.musicsetting` for interactive configuration."
      ].join("\n"));
      let patch = {};
      if (key === "volume") {
        const n = Number(value); if (!Number.isInteger(n) || n < 0 || n > 100) return fail("Volume must be from 0 to 100.");
        patch.defaultVolume = n;
      } else if (key === "maxqueue") {
        const n = Number(value); if (!Number.isInteger(n) || n < 10 || n > 500) return fail("Queue limit must be from 10 to 500.");
        patch.maxQueue = n;
      } else if (key === "djrole") {
        const id = value.replace(/[<@&>]/g, "");
        if (value === "off") patch.djRoleId = null;
        else if (message.guild.roles.cache.has(id)) patch.djRoleId = id;
        else return fail("Provide a valid role ID/mention or off.");
      } else if (["autoplay", "announce"].includes(key)) {
        if (!["on", "off"].includes(value)) return fail("Use on or off.");
        patch[key === "announce" ? "announceNowPlaying" : "autoplay"] = value === "on";
        if (key === "autoplay" && value === "on") patch.loop = "off";
      } else if (key === "source") {
        if (!["ytmsearch", "ytsearch", "scsearch"].includes(value)) return fail("Use ytmsearch, ytsearch or scsearch.");
        patch.defaultSource = value;
      } else if (key === "loop") {
        if (!["off", "track", "queue"].includes(value)) return fail("Use off, track or queue.");
        patch.loop = value; if (value !== "off") patch.autoplay = false;
      } else return fail("Unknown setting. Use `.music config` or `.musicsetting`.");
      const updated = await manager.updateSettings(guildId, patch);
      if (player && patch.defaultVolume !== undefined) await player.setVolume(updated.defaultVolume);
      if (player && patch.loop !== undefined) await player.setRepeatMode?.(updated.loop);
      return reply("✅ Settings saved", "Saved **" + key + "** for this server. The setting is persisted in Neon.", COLORS.success);
    }

    if (["play", "p", "search"].includes(sub)) {
      if (settings.requestChannelId && message.channel.id !== settings.requestChannelId) return fail("Send music requests in <#" + settings.requestChannelId + ">.");
      const query = args.join(" ").trim();
      if (!query) return fail("Provide a song or URL. Example: `.play Blinding Lights`.");
      const voice = message.member.voice.channel;
      const error = voiceError(message, player, settings);
      if (error) return fail(error);
      try {
        const active = await manager.createOrGetPlayer({ guildId, voiceChannelId: voice.id, textChannelId: message.channel.id, volume: settings.defaultVolume });
        const result = await searchWithFallback(active, query, settings, message.author);
        const tracks = result?.tracks || [];
        if (!tracks.length) return fail("No playable results. Try another query or check your Lavalink source plugins.");
        if (sub === "search") return searchPicker({ message, tracks, query, manager, player: active });
        const { addTracks } = await import("#managers/music/MusicPlaybackService");
        const wasActive = Boolean(active.queue?.current || active.playing || active.paused);
        const queued = await addTracks(active, tracks, settings.maxQueue);
        if (!queued.accepted) return fail("The queue is full (" + settings.maxQueue + " upcoming tracks).");
        if (!wasActive) return;
        const playlist = result.loadType === "playlist";
        return reply(playlist ? "📚 Playlist queued" : "🎶 Added to queue",
          (playlist ? "Added **" + queued.accepted + "** tracks from **" + clean(result.playlistInfo?.name || "playlist") + "**." : "Added **" + titleOf(tracks[0]) + "** · " + duration(tracks[0].info?.duration) + ".") +
          (queued.rejected ? "\nSkipped " + queued.rejected + " track(s) because the queue limit was reached." : ""),
          COLORS.success);
      } catch (error) { return fail("Playback request failed: " + clean(error?.message || error, 220)); }
    }

    if (["nowplaying", "np"].includes(sub)) {
      if (!player?.queue?.current) return fail("Nothing is playing right now. Use `.play <song>` to start.");
      const published = await manager.publishPlayer(player);
      return published || reply("🎧 Now playing", manager.playerEmbed(player).data.description || "Player refreshed.");
    }

    if (sub === "autoplay") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return fail("Manage Server permission is required to change server-wide autoplay.");
      const value = String(args[0] || "").toLowerCase();
      if (!["on", "off"].includes(value)) return fail("Use `.autoplay on` or `.autoplay off`.");
      const updated = await manager.updateSettings(guildId, { autoplay: value === "on", ...(value === "on" ? { loop: "off" } : {}) });
      if (value === "on" && player) await player.setRepeatMode?.("off");
      return reply("✨ Autoplay updated", "Autoplay is now **" + (updated.autoplay ? "on" : "off") + "**.", COLORS.success);
    }

    if (["pause", "resume", "skip", "back", "stop", "queue", "volume", "shuffle", "remove", "clear", "seek", "loop"].includes(sub)) {
      if (!player) return fail("There is no active player. Start with `.play <song>`.");
      const error = voiceError(message, player, settings);
      if (error) return fail(error);
      const destructive = ["clear", "remove"].includes(sub);
      const access = djError(message, settings, destructive);
      if (access) return fail(access);
      try {
        if (sub === "pause") { if (player.paused) return reply("Already paused", "Playback is already paused."); await player.pause(); return reply("⏸️ Paused", "Playback is paused."); }
        if (sub === "resume") { if (!player.paused) return reply("Already playing", "Playback is not paused."); await player.resume(); return reply("▶️ Resumed", "Playback has resumed.", COLORS.success); }
        if (sub === "skip") { if (!player.queue?.current) return fail("There is no current track to skip."); await player.skip(); return reply("⏭️ Skipped", "Skipped the current track.", COLORS.success); }
        if (sub === "back") {
          const previous = manager.previousTracks.get(guildId);
          if (!previous) return fail("No previous track is available in this session.");
          player.queue.tracks.unshift(previous); await player.skip();
          return reply("⏮️ Previous track", "Returning to the previous track.", COLORS.success);
        }
        if (sub === "stop") {
          await manager.lavalink.destroyPlayer(guildId, "music-stop");
          return reply("⏹️ Stopped", "Playback stopped and LightCore left the voice channel.", COLORS.success);
        }
        if (sub === "volume") {
          const n = Number(args[0]); if (!Number.isInteger(n) || n < 0 || n > 100) return fail("Use `.volume <0-100>`.");
          await player.setVolume(n); return reply("🔊 Volume updated", "Volume is now **" + n + "%**.", COLORS.success);
        }
        if (sub === "shuffle") {
          if ((player.queue?.tracks?.length || 0) < 2) return fail("Add at least two upcoming tracks first.");
          await player.queue.shuffle(); return reply("🔀 Queue shuffled", "Upcoming tracks have been shuffled.", COLORS.success);
        }
        if (sub === "queue") {
          const tracks = player.queue?.tracks || [];
          const page = Math.max(1, Number.parseInt(args[0] || "1", 10) || 1);
          const pageSize = 10; const pages = Math.max(1, Math.ceil(tracks.length / pageSize)); const activePage = Math.min(page, pages);
          const start = (activePage - 1) * pageSize;
          const lines = tracks.slice(start, start + pageSize).map((track, index) => "**" + (start + index + 1) + ".** " + titleOf(track) + " · " + duration(track.info?.duration));
          return reply("📜 LightCore queue", (player.queue?.current ? "**Now playing:** " + titleOf(player.queue.current) + "\n\n" : "") + (lines.join("\n") || "No upcoming tracks.") + "\n\n**" + tracks.length + "** upcoming · page " + activePage + "/" + pages);
        }
        if (sub === "remove") {
          const n = Number(args[0]); const tracks = player.queue?.tracks || [];
          if (!Number.isInteger(n) || n < 1 || n > tracks.length) return fail("Choose a queue position from 1 to " + tracks.length + ".");
          const [removed] = tracks.splice(n - 1, 1);
          return reply("🗑️ Removed from queue", "Removed **" + titleOf(removed) + "**.", COLORS.success);
        }
        if (sub === "clear") {
          const tracks = player.queue?.tracks || []; const count = tracks.length; tracks.splice(0, count);
          return reply("🧹 Queue cleared", "Removed " + count + " upcoming track(s). The current song will continue.", COLORS.success);
        }
        if (sub === "seek") {
          const seconds = Number(args[0]); const track = player.queue?.current; const total = Number(track?.info?.duration || 0);
          if (!track || track.info?.isStream || !Number.isFinite(seconds) || seconds < 0 || seconds * 1000 >= total) return fail("Use `.seek <seconds>` within the current track. Live streams cannot be seeked.");
          if (typeof player.seek !== "function") return fail("The current player does not support seeking.");
          await player.seek(Math.floor(seconds * 1000));
          return reply("⏩ Seek complete", "Jumped to **" + duration(seconds * 1000) + "**.", COLORS.success);
        }
        if (sub === "loop") {
          const mode = String(args[0] || "").toLowerCase();
          if (!["off", "track", "queue"].includes(mode)) return fail("Use `.loop off`, `.loop track`, or `.loop queue`.");
          const updated = await manager.updateSettings(guildId, { loop: mode, ...(mode !== "off" ? { autoplay: false } : {}) });
          await player.setRepeatMode?.(updated.loop);
          return reply("🔁 Repeat updated", "Repeat mode is now **" + mode + "**.", COLORS.success);
        }
      } catch (error) { return fail("That action failed: " + clean(error?.message || error, 220)); }
    }
    return fail("Unknown music command. Use `.music help`.");
  }
};
