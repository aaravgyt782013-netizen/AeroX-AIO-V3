import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ContainerBuilder, SectionBuilder, ThumbnailBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { config } from "#config/config";
import { openMusicPanel } from "./panel.js";

const COLORS = { info: 0x5865F2, success: 0x57F287, warning: 0xFEE75C, error: 0xED4245 };
const safeText = (value, max = 180) => String(value ?? "Unknown").replace(/[@\\*_~]/g, "").replace(/[\r\n]/g, " ").slice(0, max);
const duration = ms => {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return "LIVE";
  const seconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : minutes + ":" + String(seconds % 60).padStart(2, "0");
};
const trackTitle = track => safeText(track?.info?.title || "Unknown track");
const trackUrl = track => /^https?:\/\//i.test(track?.info?.uri || "") ? track.info.uri : null;

function embed(title, description, color = COLORS.info) {
  return new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# ❄️ LIGHTCORE • " + safeText(title, 90) + "\n" + String(description || "No details provided.").slice(0, 3500)))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# 🎧 LightCore Music • Use .music help for commands"));
}
function playerControls(player, settings) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_music:previous").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_music:toggle").setEmoji(player.paused ? "▶️" : "⏸️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("aerox_music:skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_music:stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("aerox_music:queue").setEmoji("📜").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_music:vol_down").setLabel("Volume −").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_music:vol_up").setLabel("Volume +").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_music:loop").setLabel("Loop: " + (settings.loop || "off")).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_music:shuffle").setLabel("Shuffle").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_music:autoplay").setLabel("Autoplay: " + (settings.autoplay ? "On" : "Off")).setStyle(settings.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_music:dashboard").setLabel("Open Music Dashboard").setEmoji("🎛️").setStyle(ButtonStyle.Primary)
    )
  ];
}
function nowPlayingEmbed(player, track) {
  const info = track?.info || {};
  const url = trackUrl(track);
  const progress = info.isStream ? "🔴 **LIVE**" : "`" + duration(player.position || 0) + " / " + duration(info.duration) + "`";
  const artwork = info.artworkUrl || info.thumbnail || info.image || null;
  const playerSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# ✦ LIGHTCORE • NOW PLAYING\n-# MUSIC FOR YOUR COMMUNITY\n" +
      (url ? "[" + trackTitle(track) + "](" + url + ")" : "**" + trackTitle(track) + "**") + "\n\n" + progress
    ));
  if (/^https?:\/\//i.test(String(artwork || ""))) {
    playerSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(artwork).setDescription("Album artwork for " + trackTitle(track)));
  }
  return new ContainerBuilder().setAccentColor(COLORS.info)
    .addSectionComponents(playerSection)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      "🎤 **Artist:** " + safeText(info.author || "Unknown", 100),
      "⏱️ **Duration:** " + (info.isStream ? "LIVE" : duration(info.duration)),
      "🙋 **Requested by:** " + safeText(track?.requester?.username || track?.requester?.tag || "A listener", 100),
      "📜 **Queue:** " + String(player.queue?.tracks?.length || 0) + " upcoming",
      "🔊 **Volume:** " + String(player.volume ?? 70) + "%"
    ].join("\n")))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LightCore Music • Interactive controls"));
}
function voiceCheck(message, player, member = message.member) {
  const voice = member?.voice?.channel;
  if (!voice) return "Join a voice channel first.";
  if (player?.voiceChannelId && player.voiceChannelId !== voice.id) return "Join the same voice channel as the bot to control music.";
  const perms = voice.permissionsFor(message.guild.members.me);
  if (!perms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return "I need Connect and Speak permissions in your voice channel.";
  return null;
}
function djCheck(message, settings, member = message.member) {
  if (!settings.djRoleId || member.roles.cache.has(settings.djRoleId) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
  return "You need the configured DJ role <@&" + settings.djRoleId + "> to control playback.";
}
async function addTracks(player, tracks, maxQueue) {
  const available = Math.max(0, maxQueue - (player.queue?.tracks?.length || 0));
  const accepted = tracks.slice(0, available);
  for (const track of accepted) await player.queue.add(track);
  if (accepted.length && !player.playing && !player.paused) await player.play();
  return { accepted: accepted.length, rejected: tracks.length - accepted.length };
}
async function sendSearchPicker(message, tracks, query, player, manager, settings) {
  const shown = tracks.slice(0, 5);
  const row = new ActionRowBuilder().addComponents(shown.map((track, index) =>
    new ButtonBuilder().setCustomId("aerox_search:" + index)
      .setLabel((index + 1) + ". " + safeText(track.info?.title, 70))
      .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ));
  const lines = shown.map((track, index) => "**" + (index + 1) + ".** " + trackTitle(track) + " · " + duration(track.info?.duration));
  const searchContainer = new ContainerBuilder().setAccentColor(COLORS.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🔎 LIGHTCORE • SEARCH RESULTS\n## " + safeText(query, 80) + "\n\n" + lines.join("\n") + "\n\n-# Choose a result below to add it to the queue."));
  const sent = await message.reply({ components: [searchContainer, row], flags: MessageFlags.IsComponentsV2 });
  const collector = sent.createMessageComponentCollector({ time: 45000 });
  collector.on("collect", async interaction => {
    if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Only the person who started this search can select a result.", ephemeral: true });
    const voiceError = voiceCheck(message, manager.getPlayer(message.guild.id));
    if (voiceError) return interaction.reply({ content: voiceError, ephemeral: true });
    const freshPlayer = manager.getPlayer(message.guild.id) || player;
    const accessError = djCheck(message, manager.getSettings(message.guild.id));
    if (accessError) return interaction.reply({ content: accessError, ephemeral: true });
    const selected = shown[Number(interaction.customId.split(":")[1])];
    if (!selected) return interaction.reply({ content: "That search result is no longer available.", ephemeral: true });
    try {
      if ((freshPlayer.queue?.tracks?.length || 0) >= settings.maxQueue) return interaction.reply({ content: "The queue is full (" + settings.maxQueue + " tracks).", ephemeral: true });
      await freshPlayer.queue.add(selected);
      if (!freshPlayer.playing && !freshPlayer.paused) await freshPlayer.play();
      await interaction.update({ components: [new ContainerBuilder().setAccentColor(COLORS.success).addTextDisplayComponents(new TextDisplayBuilder().setContent("# ✅ ADDED TO QUEUE\n[" + trackTitle(selected) + "](" + (trackUrl(selected) || "https://discord.com") + ") · " + duration(selected.info?.duration)))] });
      collector.stop("selected");
    } catch (error) {
      await interaction.reply({ content: "Could not add this track: " + safeText(error.message, 180), ephemeral: true }).catch(() => {});
    }
  });
  collector.on("end", (_, reason) => { if (reason !== "selected") sent.edit({ components: [searchContainer] }).catch(() => {}); });
}

export default {
  name: "music",
  aliases: ["m", "player"],
  description: "Full music player with search, queue, interactive controls, and per-server settings.",
  usage: "music <play|search|pause|resume|skip|back|stop|queue|nowplaying|volume|shuffle|remove|clear|seek|loop|autoplay|config|help>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],

  async execute({ client, message, args }) {
    if (!message.guild || !message.member) return;
    const manager = client.music;
    const guildId = message.guild.id;
    const sub = String(args.shift() || "help").toLowerCase();
    const settings = manager.getSettings(guildId);
    let player = manager.getPlayer(guildId);
    const reply = (description, title = "LightCore Music", color = COLORS.info) => message.reply({ components: [embed(title, description, color)], flags: MessageFlags.IsComponentsV2 });
    const fail = text => reply(text, "Music action unavailable", COLORS.error);

    if (!config.music.enabled) return fail("Music is disabled by the bot owner.");
    if (["panel", "setup", "dashboard"].includes(sub)) return openMusicPanel({ client, message });
    if (!manager.lavalink || !manager.lavalink.useable) return fail("The music engine has no usable Lavalink node. Check the Render Lavalink host, port, password, TLS setting, and node logs; playback cannot work without a reachable node.");

    if (sub === "help") return reply([
      "**🎧 Playback**",
      "`.play <song or URL>` · `.search <query>` · `.pause` · `.resume` · `.skip` · `.back` · `.stop`",
      "`.nowplaying` — show the current track and interactive track controls",
      "",
      "**📜 Queue**",
      "`.queue [page]` · `.shuffle` · `.remove <position>` · `.clear`",
      "",
      "**🔊 Sound & playback modes**",
      "`.volume <0-100>` · `.seek <seconds>` · `.loop <off|track|queue>` · `.autoplay <on|off>`",
      "",
      "**🎛️ Interactive controls**",
      "`.music panel` / `.musicpanel` — player dashboard with previous, pause/resume, skip, stop, queue, volume, loop and shuffle controls",
      "",
      "**⚙️ Server settings** *(Manage Server required)*",
      "`.musicsetting` — dedicated interactive settings panel",
      "`.music config` — view settings",
      "`.music config volume <1-100>` · `.music config maxqueue <10-500>`",
      "`.music config djrole <role ID|off>` · `.music config announce <on|off>`",
      "`.music config autoplay <on|off>` · `.music config source <ytmsearch|ytsearch|scsearch>`",
      "",
      "Settings are stored per server in Neon. Playback requires a reachable Lavalink v4 node and compatible source plugin."
    ].join("\n"), "🎛️ LightCore Music Help");

    if (sub === "config") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return fail("Only members with Manage Server can change server music settings.");
      const key = String(args.shift() || "").toLowerCase();
      const value = args.join(" ").trim();
      if (!key) return reply([
        "**Default volume:** " + settings.defaultVolume + "%",
        "**Queue limit:** " + settings.maxQueue,
        "**DJ role:** " + (settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Not set"),
        "**Now-playing announcements:** " + (settings.announceNowPlaying ? "On" : "Off"),
        "**Search source:** " + settings.defaultSource,
        "**Autoplay:** " + (settings.autoplay ? "On" : "Off"),
        "**Loop:** " + settings.loop, "",
        "Examples: .music config volume 75, maxqueue 150, djrole ROLE_ID, announce off, autoplay on, source ytmsearch."
      ].join("\n"), "⚙️ Server Music Settings");
      const patch = {};
      if (key === "volume") {
        const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 100) return fail("Volume must be a whole number from 1 to 100.");
        patch.defaultVolume = n;
      } else if (key === "maxqueue") {
        const n = Number(value); if (!Number.isInteger(n) || n < 10 || n > 500) return fail("Queue limit must be a whole number from 10 to 500.");
        patch.maxQueue = n;
      } else if (key === "djrole") {
        const id = value.replace(/[<@&>]/g, "");
        if (value.toLowerCase() === "off") patch.djRoleId = null;
        else if (message.guild.roles.cache.has(id)) patch.djRoleId = id;
        else return fail("Provide a valid role mention/ID or off.");
      } else if (key === "announce" || key === "autoplay") {
        if (!["on", "off"].includes(value.toLowerCase())) return fail("Use on or off.");
        patch[key === "announce" ? "announceNowPlaying" : "autoplay"] = value.toLowerCase() === "on";
      } else if (key === "source") {
        if (!["ytmsearch", "ytsearch", "scsearch"].includes(value.toLowerCase())) return fail("Supported sources: ytmsearch, ytsearch, scsearch.");
        patch.defaultSource = value.toLowerCase();
      } else return fail("Unknown setting. Use .music config to see supported settings.");
      const updated = await manager.updateSettings(guildId, patch);
      if (key === "volume" && player) await player.setVolume(updated.defaultVolume);
      return reply("Saved " + key + " for this server. Music settings are persisted in Neon.", "✅ Settings saved", COLORS.success);
    }

    if (["play", "p", "search"].includes(sub)) {
      if (settings.requestChannelId && message.channel.id !== settings.requestChannelId) {
        return fail("Music requests are restricted to <#" + settings.requestChannelId + "> in this server.");
      }
      const query = args.join(" ").trim();
      if (!query) return fail("Tell me what to play: .play <song or URL>.");
      const voice = message.member.voice.channel;
      if (!voice) return fail("Join a voice channel before requesting music.");
      if (settings.allowedVoiceChannelId && voice.id !== settings.allowedVoiceChannelId) {
        return fail("Music playback is restricted to <#" + settings.allowedVoiceChannelId + "> in this server.");
      }
      const voicePerms = voice.permissionsFor(message.guild.members.me);
      if (!voicePerms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return fail("I need Connect and Speak permissions in your voice channel.");
      if (player?.voiceChannelId && player.voiceChannelId !== voice.id) return fail("I'm already playing in another voice channel in this server.");
      try {
        if (!player) player = manager.lavalink.createPlayer({ guildId, voiceChannelId: voice.id, textChannelId: message.channel.id, selfDeaf: true, volume: settings.defaultVolume });
        if (!player.connected) await player.connect();
        if (typeof player.setRepeatMode === "function") await player.setRepeatMode(settings.loop || "off");
        const isUrl = /^https?:\/\//i.test(query);
        const result = await player.search({ query, ...(isUrl ? {} : { source: settings.defaultSource }) }, message.author);
        const tracks = result?.tracks || [];
        if (!tracks.length) return fail("No playable results. Try another search or URL, and verify the Lavalink source plugin.");
        if (sub === "search") return sendSearchPicker(message, tracks, query, player, manager, settings);
        if (result.loadType === "playlist") {
          const added = await addTracks(player, tracks, settings.maxQueue);
          if (!added.accepted) return fail("The queue is full (" + settings.maxQueue + " tracks).");
          return reply("📚 Added " + added.accepted + " track(s) from **" + safeText(result.playlistInfo?.name || "playlist") + "**." + (added.rejected ? "\nSkipped " + added.rejected + " track(s) because the queue limit was reached." : ""), "Playlist queued", COLORS.success);
        }
        const track = tracks[0];
        if ((player.queue?.tracks?.length || 0) >= settings.maxQueue) return fail("The queue is full (" + settings.maxQueue + " tracks).");
        await player.queue.add(track);
        if (!player.playing && !player.paused) await player.play();
        const url = trackUrl(track);
        return reply("🎶 Added " + (url ? "[" + trackTitle(track) + "](" + url + ")" : "**" + trackTitle(track) + "**") + " · " + duration(track.info?.duration) + "\nRequested by " + message.author + ".", "Added to queue", COLORS.success);
      } catch (error) { return fail("Playback request failed: " + safeText(error?.message || error, 220)); }
    }

    if (sub === "nowplaying" || sub === "np") {
      if (!player?.queue?.current) return fail("Nothing is playing right now. Use .play <song> to start.");
      const sent = await message.reply({ components: [nowPlayingEmbed(player, player.queue.current), ...playerControls(player, settings)], flags: MessageFlags.IsComponentsV2 });
      const collector = sent.createMessageComponentCollector();
      collector.on("collect", async interaction => {
        const fresh = manager.getPlayer(guildId);
        if (!fresh) return interaction.reply({ content: "The player has ended. Start another track to continue.", ephemeral: true });
        const actor = message.guild.members.cache.get(interaction.user.id) || await message.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!actor) return interaction.reply({ content: "I could not verify your server membership. Try again.", ephemeral: true });
        const action = interaction.customId.split(":").at(-1);
        if (action === "dashboard") {
          try {
            return await openMusicPanel({
              client,
              message: {
                guild: interaction.guild,
                member: actor,
                reply: options => interaction.reply({
                  ...options,
                  flags: (options.flags || 0) | MessageFlags.Ephemeral,
                  fetchReply: true
                })
              }
            });
          } catch {
            return interaction.reply({ content: "Could not open the dashboard. Try .musicpanel in this server.", ephemeral: true }).catch(() => {});
          }
        }
        const voiceError = voiceCheck(message, fresh, actor);
        if (voiceError) return interaction.reply({ content: voiceError, ephemeral: true });
        const accessError = djCheck(message, manager.getSettings(guildId), actor);
        if (accessError) return interaction.reply({ content: accessError, ephemeral: true });
        try {
          switch (action) {
            case "toggle": if (fresh.paused) await fresh.resume(); else await fresh.pause(); break;
            case "skip": if (!fresh.queue.current) throw new Error("No current track."); await fresh.skip(); break;
            case "previous": {
              const previous = manager.previousTracks.get(guildId);
              if (!previous) throw new Error("No previous track is available in this player session.");
              fresh.queue.tracks.unshift(previous); if (fresh.playing) await fresh.skip(); break;
            }
            case "stop":
              await manager.lavalink.destroyPlayer(guildId, "control-stop");
              collector.stop("stopped");
              await interaction.update({ components: [new ContainerBuilder().setAccentColor(COLORS.warning).addTextDisplayComponents(new TextDisplayBuilder().setContent("# ⏹️ Playback stopped\nThe player has stopped and LightCore has left the voice channel."))] }); return;
            case "queue": {
              const list = fresh.queue.tracks || [];
              return interaction.reply({ components: [embed("📜 Up Next", list.slice(0, 10).map((t, i) => (i + 1) + ". **" + trackTitle(t) + "** · " + duration(t.info?.duration)).join("\n") || "No upcoming tracks.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            case "vol_down": await fresh.setVolume(Math.max(0, Number(fresh.volume ?? 70) - 10)); break;
            case "vol_up": await fresh.setVolume(Math.min(100, Number(fresh.volume ?? 70) + 10)); break;
            case "loop": {
              const current = manager.getSettings(guildId);
              const next = current.loop === "off" ? "track" : current.loop === "track" ? "queue" : "off";
              await manager.updateSettings(guildId, { loop: next });
              if (typeof fresh.setRepeatMode === "function") await fresh.setRepeatMode(next);
              break;
            }
            case "shuffle": await fresh.queue.shuffle(); break;
            case "autoplay": {
              const currentSettings = manager.getSettings(guildId);
              await manager.updateSettings(guildId, { autoplay: !currentSettings.autoplay });
              break;
            }
            default: return interaction.reply({ content: "Unknown player control.", ephemeral: true });
          }
          const updated = manager.getSettings(guildId);
          const currentTrack = fresh.queue?.current;
          await interaction.update({ components: [currentTrack ? nowPlayingEmbed(fresh, currentTrack) : new ContainerBuilder().setAccentColor(COLORS.info).addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎧 LIGHTCORE MUSIC\nThe current track has ended.")), ...(currentTrack ? playerControls(fresh, updated) : [])] });
        } catch (error) {
          if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: safeText(error?.message || error, 180), ephemeral: true }).catch(() => {});
        }
      });
      // Keep the interactive now-playing controls active until playback is stopped or the message is deleted.
      return;
    }

    if (["pause", "resume", "skip", "back", "stop", "queue", "volume", "shuffle", "remove", "clear", "seek", "loop", "autoplay"].includes(sub)) {
      const voiceError = voiceCheck(message, player);
      if (voiceError) return fail(voiceError);
      if (!player) return fail("There is no active player. Start one with .play <song>.");
      const accessError = djCheck(message, settings);
      if (accessError) return fail(accessError);
      try {
        if (sub === "pause") { if (player.paused) return reply("Playback is already paused."); await player.pause(); return reply("⏸️ Paused."); }
        if (sub === "resume") { if (!player.paused) return reply("Playback is not paused."); await player.resume(); return reply("▶️ Resumed."); }
        if (sub === "skip") { if (!player.queue.current) return fail("There is no current track."); await player.skip(); return reply("⏭️ Skipped the current track.", "Skipped", COLORS.success); }
        if (sub === "back") {
          const previous = manager.previousTracks.get(guildId);
          if (!previous) return fail("There is no previous track stored in this player session.");
          player.queue.tracks.unshift(previous); await player.skip(); return reply("⏮️ Returned to the previous track.");
        }
        if (sub === "stop") { await manager.lavalink.destroyPlayer(guildId, "user-stop"); return reply("⏹️ Playback stopped and I left the voice channel.", "Stopped", COLORS.success); }
        if (sub === "volume") {
          const n = Number(args[0]); if (!Number.isInteger(n) || n < 0 || n > 100) return fail("Use .volume <0-100>.");
          await player.setVolume(n); return reply("🔊 Volume set to **" + n + "%**.", "Volume updated", COLORS.success);
        }
        if (sub === "shuffle") { if ((player.queue.tracks || []).length < 2) return fail("Add at least two tracks before shuffling."); await player.queue.shuffle(); return reply("🔀 Shuffled the upcoming queue.", "Queue shuffled", COLORS.success); }
        if (sub === "queue") {
          const tracks = player.queue.tracks || []; const current = player.queue.current;
          const page = Math.max(1, Number.parseInt(args[0] || "1", 10) || 1); const pageSize = 10; const pages = Math.max(1, Math.ceil(tracks.length / pageSize));
          const start = (Math.min(page, pages) - 1) * pageSize;
          const lines = tracks.slice(start, start + pageSize).map((track, i) => "**" + (start + i + 1) + ".** " + trackTitle(track) + " · " + duration(track.info?.duration));
          return reply("**Now playing:** " + (current ? trackTitle(current) : "Nothing") + "\n" + (current ? "**Duration:** " + duration(current.info?.duration) + "\n\n" : "\n") + (lines.join("\n") || "No upcoming tracks.") + "\n\n**Queue:** " + tracks.length + " upcoming · page " + Math.min(page, pages) + "/" + pages, "📜 Music Queue");
        }
        if (sub === "remove") {
          const n = Number(args[0]); const tracks = player.queue.tracks || [];
          if (!Number.isInteger(n) || n < 1 || n > tracks.length) return fail("Provide a queue position from 1 to " + tracks.length + ".");
          const removed = tracks[n - 1]; tracks.splice(n - 1, 1);
          return reply("Removed **" + trackTitle(removed) + "** from the queue.", "Track removed", COLORS.success);
        }
        if (sub === "clear") { const tracks = player.queue.tracks || []; const count = tracks.length; tracks.splice(0, tracks.length); return reply("Cleared " + count + " upcoming track(s). The current track will finish.", "Queue cleared", COLORS.success); }
        if (sub === "seek") {
          const seconds = Number(args[0]); const track = player.queue.current;
          if (!track || track.info?.isStream || !Number.isFinite(seconds) || seconds < 0 || seconds * 1000 >= Number(track.info?.duration || 0)) return fail("Use .seek <seconds> within the current track's duration. Live streams cannot be seeked.");
          if (typeof player.seek !== "function") return fail("Seeking is not supported by the connected Lavalink player.");
          await player.seek(Math.floor(seconds * 1000)); return reply("⏩ Seeked to " + duration(seconds * 1000) + ".", "Seek complete", COLORS.success);
        }
        if (sub === "loop") {
          const mode = String(args[0] || "").toLowerCase();
          if (!["off", "track", "queue"].includes(mode)) return fail("Use .loop off, .loop track, or .loop queue.");
          await manager.updateSettings(guildId, { loop: mode });
          if (typeof player.setRepeatMode === "function") await player.setRepeatMode(mode);
          return reply("🔁 Loop mode set to **" + mode + "**.", "Loop updated", COLORS.success);
        }
        if (sub === "autoplay") {
          const value = String(args[0] || "").toLowerCase();
          if (!["on", "off"].includes(value)) return fail("Use .autoplay on or .autoplay off.");
          await manager.updateSettings(guildId, { autoplay: value === "on" });
          return reply("Autoplay is now **" + value + "** for this server.", "Autoplay updated", COLORS.success);
        }
      } catch (error) { return fail("That action failed: " + safeText(error?.message || error, 220)); }
    }
    return fail("Unknown music command. Use .music help to see available controls.");
  }
};
