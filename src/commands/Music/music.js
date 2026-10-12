import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "#config/config";

const fmt = ms => {
  if (!ms || !Number.isFinite(Number(ms))) return "LIVE";
  const sec = Math.floor(Number(ms) / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};
const clean = s => String(s || "").replace(/[@\\*_~`]/g, "").slice(0, 180);

export default {
  name: "music",
  aliases: ["m", "player"],
  description: "Advanced music player: play, queue, controls, and per-server settings.",
  usage: "music <play|pause|resume|skip|stop|queue|nowplaying|volume|shuffle|loop|config|help>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],

  async execute({ client, message, args }) {
    const manager = client.music;
    const guildId = message.guild.id;
    const sub = (args.shift() || "help").toLowerCase();
    const settings = manager.getSettings(guildId);
    const player = manager.getPlayer(guildId);
    const memberVoice = message.member.voice.channel;
    const requireVoice = () => {
      if (!memberVoice) throw new Error("Join a voice channel first, then use the music command.");
      if (player?.voiceChannelId && player.voiceChannelId !== memberVoice.id) throw new Error("Join my current voice channel to control playback.");
    };
    const reply = (description, title = "LightCore Music", color = 0x5865F2) => message.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: "LightCore • Music for your server" })] });

    if (!config.music.enabled) return reply("Music is currently disabled by the bot owner.", "Music Disabled", 0xED4245);
    if (!manager.lavalink?.useable) return reply("The music engine has no connected Lavalink node. The bot can stay online, but playback needs a reachable Lavalink v4 node. Configure the Lavalink environment variables in Render.", "Music Node Unavailable", 0xED4245);

    try {
      if (sub === "help") return reply([
        "**Playback**",
        "`.music play <song or URL>` · `.music pause` · `.music resume`",
        "`.music skip` · `.music stop` · `.music queue` · `.music nowplaying`",
        "**Queue & sound**",
        "`.music volume <0-100>` · `.music shuffle` · `.music loop <off|queue>`",
        "**Server setup**",
        "`.music config` · `.music config volume <1-100>`",
        "`.music config maxqueue <10-500>` · `.music config djrole <role ID|off>`",
        "`.music config announce <on|off>` · `.music config autoplay <on|off>`",
        "`.music config source <ytmsearch|ytsearch|scsearch>`",
        "",
        "Requires the bot to have **Connect** and **Speak** permissions. Search support depends on the configured Lavalink node and its plugins."
      ].join("\n"), "🎛️ Music Controls");
      if (sub === "config") {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return reply("Only members with **Manage Server** can change music settings.", "Permission required", 0xED4245);
        const key = (args.shift() || "").toLowerCase();
        const value = args.join(" ").trim();
        if (!key) return reply([
          `**Default volume:** ${settings.defaultVolume}%`,
          `**Queue limit:** ${settings.maxQueue}`,
          `**DJ role:** ${settings.djRoleId ? `<@&${settings.djRoleId}>` : "Not set (anyone in the same voice channel)"}`,
          `**Now-playing announcements:** ${settings.announceNowPlaying ? "On" : "Off"}`,
          `**Search source:** ${settings.defaultSource}`,
          `**Autoplay:** ${settings.autoplay ? "On" : "Off"}`,
          `**Loop:** ${settings.loop}`,
          "",
          "Set: `.music config volume 75`, `maxqueue 150`, `djrole ROLE_ID`, `announce off`, `autoplay on`, or `source ytmsearch`."
        ].join("\n"), "⚙️ Server Music Settings");
        let patch = {};
        if (key === "volume") {
          const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 100) return reply("Volume must be a whole number from 1 to 100.", "Invalid setting", 0xED4245);
          patch.defaultVolume = n;
        } else if (key === "maxqueue") {
          const n = Number(value); if (!Number.isInteger(n) || n < 10 || n > 500) return reply("Queue limit must be a whole number from 10 to 500.", "Invalid setting", 0xED4245);
          patch.maxQueue = n;
        } else if (key === "djrole") {
          if (value.toLowerCase() === "off") patch.djRoleId = null;
          else if (message.guild.roles.cache.has(value.replace(/[<@&>]/g, ""))) patch.djRoleId = value.replace(/[<@&>]/g, "");
          else return reply("Provide a valid role mention/ID, or use `off`.", "Invalid role", 0xED4245);
        } else if (key === "announce") {
          if (!["on", "off"].includes(value.toLowerCase())) return reply("Use `on` or `off`.", "Invalid setting", 0xED4245);
          patch.announceNowPlaying = value.toLowerCase() === "on";
        } else if (key === "autoplay") {
          if (!["on", "off"].includes(value.toLowerCase())) return reply("Use `on` or `off`.", "Invalid setting", 0xED4245);
          patch.autoplay = value.toLowerCase() === "on";
        } else if (key === "source") {
          if (!["ytmsearch", "ytsearch", "scsearch"].includes(value.toLowerCase())) return reply("Supported source aliases: `ytmsearch`, `ytsearch`, `scsearch`.", "Invalid source", 0xED4245);
          patch.defaultSource = value.toLowerCase();
        } else return reply("Unknown setting. Use `.music config` to see supported options.", "Invalid setting", 0xED4245);
        const updated = await manager.updateSettings(guildId, patch);
        if (key === "volume" && player) await player.setVolume(updated.defaultVolume);
        return reply(`Saved **${key}**. The setting is now ${key === "djrole" ? (updated.djRoleId ? `<@&${updated.djRoleId}>` : "off") : key === "announce" ? (updated.announceNowPlaying ? "on" : "off") : key === "source" ? updated.defaultSource : key === "volume" ? updated.defaultVolume + "%" : key === "autoplay" ? (updated.autoplay ? "on" : "off") : updated.maxQueue}.`, "✅ Music settings saved", 0x57F287);
      }

      if (["pause", "resume", "skip", "stop", "queue", "nowplaying", "volume", "shuffle", "loop"].includes(sub)) {
        requireVoice();
        if (!player) return reply("Nothing is playing yet. Start a track with `.music play <song>`.", "No active player", 0xED4245);
        if (settings.djRoleId && !message.member.roles.cache.has(settings.djRoleId) && !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return reply(`You need the configured DJ role <@&${settings.djRoleId}> to control playback.`, "DJ role required", 0xED4245);
        if (sub === "pause") { if (player.paused) return reply("Playback is already paused."); await player.pause(); return reply("⏸️ Playback paused."); }
        if (sub === "resume") { if (!player.paused) return reply("Playback is not paused."); await player.resume(); return reply("▶️ Playback resumed."); }
        if (sub === "skip") { if (!player.queue.current) return reply("There is no current track.", "Nothing to skip", 0xED4245); await player.skip(); return reply("⏭️ Skipped the current track."); }
        if (sub === "stop") { await manager.lavalink.destroyPlayer(guildId, "user-stop"); return reply("⏹️ Playback stopped and I left the voice channel."); }
        if (sub === "volume") {
          const n = Number(args[0]); if (!Number.isInteger(n) || n < 0 || n > 100) return reply("Use `.music volume <0-100>`.", "Invalid volume", 0xED4245);
          await player.setVolume(n); return reply(`🔊 Volume set to **${n}%**.`);
        }
        if (sub === "shuffle") { const tracks = player.queue.tracks; if (!tracks || tracks.length < 2) return reply("Add at least two queued tracks before shuffling."); await player.queue.shuffle(); return reply("🔀 Shuffled the upcoming queue."); }
        if (sub === "loop") {
          const mode = (args[0] || "").toLowerCase();
          if (!["off", "queue"].includes(mode)) return reply("Use `.music loop off` or `.music loop queue`.", "Invalid loop mode", 0xED4245);
          await manager.updateSettings(guildId, { loop: mode });
          if (typeof player.setRepeatMode === "function") await player.setRepeatMode(mode === "queue" ? "queue" : "off");
          return reply(`🔁 Loop mode set to **${mode}**.`);
        }
        if (sub === "nowplaying") {
          const track = player.queue.current; if (!track) return reply("Nothing is playing right now.");
          const info = track.info || {};
          return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("🎧 Now Playing").setDescription(`[${clean(info.title)}](${info.uri || "https://discord.com"})`).addFields({ name: "Artist", value: clean(info.author || "Unknown"), inline: true }, { name: "Duration", value: info.isStream ? "LIVE" : fmt(info.duration), inline: true }, { name: "Position", value: fmt(player.position || 0), inline: true })] });
        }
        if (sub === "queue") {
          const tracks = player.queue.tracks || [];
          const current = player.queue.current;
          const lines = tracks.slice(0, 10).map((track, i) => `${i + 1}. **${clean(track.info?.title)}** · ${fmt(track.info?.duration)}`);
          return reply(`**Now:** ${current ? clean(current.info?.title) : "Nothing"}\n\n${lines.join("\n") || "No upcoming tracks."}${tracks.length > 10 ? `\n…and ${tracks.length - 10} more.` : ""}\n\n**Upcoming:** ${tracks.length} track(s)`, "📜 Queue");
        }
      }

      if (sub === "play" || sub === "p") {
        const query = args.join(" ").trim();
        if (!query) return reply("Tell me what to play: `.music play <song name or URL>`.", "Missing search", 0xED4245);
        if (!memberVoice) return reply("Join a voice channel before requesting music.", "Voice channel required", 0xED4245);
        const botMember = message.guild.members.me;
        const permissions = memberVoice.permissionsFor(botMember);
        if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return reply("I need **Connect** and **Speak** permissions in your voice channel.", "Missing permissions", 0xED4245);
        let active = player;
        if (active && active.voiceChannelId !== memberVoice.id) return reply("I'm already playing in another voice channel in this server.", "Already in another channel", 0xED4245);
        active ||= manager.lavalink.createPlayer({ guildId, voiceChannelId: memberVoice.id, textChannelId: message.channel.id, selfDeaf: true, volume: settings.defaultVolume });
        if (!active.connected) await active.connect();
        const source = /^https?:\/\//i.test(query) ? undefined : settings.defaultSource;
        const result = await active.search({ query, ...(source ? { source } : {}) }, message.author);
        if (!result?.tracks?.length) return reply("No playable results came back. Try another search, check the URL, or verify that the Lavalink node has a supported source plugin.", "No results", 0xED4245);
        if (result.loadType === "playlist") {
          const tracks = result.tracks.slice(0, Math.max(0, settings.maxQueue - active.queue.tracks.length));
          if (!tracks.length) return reply(`The queue is full (${settings.maxQueue} tracks).`, "Queue limit reached", 0xED4245);
          for (const track of tracks) await active.queue.add(track);
          if (!active.playing && !active.paused) await active.play();
          return reply(`📚 Added **${tracks.length}** tracks from **${clean(result.playlistInfo?.name || "playlist")}**.`, "Playlist queued", 0x57F287);
        }
        const track = result.tracks[0];
        if ((active.queue.tracks?.length || 0) >= settings.maxQueue) return reply(`The queue is full (${settings.maxQueue} tracks). Remove or play queued tracks before adding more.`, "Queue limit reached", 0xED4245);
        await active.queue.add(track);
        if (!active.playing && !active.paused) await active.play();
        return reply(`🎶 Added [**${clean(track.info?.title)}**](${track.info?.uri || "https://discord.com"}) · ${fmt(track.info?.duration)}\nRequested by ${message.author}`, "Added to queue", 0x57F287);
      }
      return reply("Unknown subcommand. Use `.music help` to see playback controls and server configuration.", "Unknown command", 0xED4245);
    } catch (error) {
      return reply(`The music action failed: ${String(error?.message || error).slice(0, 250)}`, "Music error", 0xED4245);
    }
  },
};
