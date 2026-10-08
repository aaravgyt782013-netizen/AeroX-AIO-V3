import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder
} from "discord.js";
import emoji from "#config/emoji";
import { PlayerManager } from "#managers/PlayerManager";

export const MUSIC_COLOR = 0x5865F2;
export const ERROR_COLOR = 0xED4245;
export const SUCCESS_COLOR = 0x57F287;
export const v2Flags = MessageFlags.IsComponentsV2;

const text = value => new TextDisplayBuilder().setContent(String(value ?? ""));
function emojiObject(name, fallback = null) {
  const raw = emoji.get(name, fallback || "");
  const match = String(raw).match(/^<a?:[^:>]+:(\d+)>$/);
  return match ? { id: match[1], animated: String(raw).startsWith("<a:") } : (raw || undefined);
}
const E = (name, fallback) => emoji.get(name, fallback);

export function formatDuration(ms) {
  if (ms == null || ms < 0 || !Number.isFinite(Number(ms))) return "LIVE";
  const total = Math.floor(Number(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") : m + ":" + String(s).padStart(2, "0");
}

export function parseTime(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^\d+:\d+(?::\d+)?$/.test(v)) {
    const a = v.split(":").map(Number);
    return (a.length === 2 ? a[0] * 60 + a[1] : a[0] * 3600 + a[1] * 60 + a[2]) * 1000;
  }
  let total = 0, match;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hour|hours|m|min|minute|minutes|s|sec|second|seconds)/g;
  while ((match = re.exec(v))) total += Number(match[1]) * (match[2].startsWith("h") ? 3600000 : match[2].startsWith("m") ? 60000 : 1000);
  return total || (/^\d+$/.test(v) ? Number(v) * 1000 : null);
}

export function context(x) {
  if (x.interaction) return {
    client: x.client, source: x.interaction, guild: x.interaction.guild,
    member: x.interaction.member, user: x.interaction.user, channel: x.interaction.channel,
    args: [], slash: true
  };
  return {
    client: x.client, source: x.message, guild: x.message.guild,
    member: x.message.member, user: x.message.author, channel: x.message.channel,
    args: x.args || [], slash: false
  };
}

export async function reply(x, payload) {
  const c = context(x);
  if (c.slash) return c.source.replied || c.source.deferred ? c.source.editReply(payload) : c.source.reply(payload);
  return c.source.reply(payload);
}

export function musicContainer({ title = E("music", "🎵") + " **LIGHTCORE • MUSIC**", description = "", sections = [], components = [], accent = MUSIC_COLOR } = {}) {
  const container = new ContainerBuilder().setAccentColor(accent);
  container.addTextDisplayComponents(text(title));
  if (description) container.addTextDisplayComponents(text(description));
  if (sections.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    for (const section of sections) container.addTextDisplayComponents(text(section));
  }
  if (components.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    for (const component of components) container.addActionRowComponents(component);
  }
  return container;
}

export function v2Payload(container, extra = {}) {
  const extraFlags = Number(extra.flags || 0);
  return { ...extra, components: [container], flags: v2Flags | extraFlags };
}

export async function safeReply(x, title, description, color = MUSIC_COLOR) {
  return reply(x, v2Payload(musicContainer({ title, description, accent: color })));
}

export function voiceChannel(x) {
  return context(x).member?.voice?.channel || null;
}

export function musicSettings(x) {
  const c = context(x);
  try {
    const s = c.client.db.guild.getMusicSettings(c.guild.id);
    return {
      djRole: s.djRole ?? s.dj_role ?? null,
      autoplay: Boolean(s.autoplay),
      announceSongs: s.announceSongs !== false,
      voteSkip: Boolean(s.voteSkip),
      source: s.source || "ytmsearch",
      mode247: Boolean(s.mode247)
    };
  } catch {
    return { djRole: null, autoplay: false, announceSongs: true, voteSkip: false, source: "ytmsearch", mode247: false };
  }
}

export function djError(x) {
  const c = context(x);
  if (!c.guild) return "Server only.";
  if (c.member?.permissions?.has("Administrator") || c.member?.permissions?.has("ManageGuild")) return null;
  const role = musicSettings(x).djRole;
  return role && !c.member?.roles?.cache?.has(role) ? "You need the configured DJ role to control music." : null;
}

export function sameVoiceError(x, player) {
  const c = context(x);
  if (!player?.voiceChannelId) return null;
  if (!c.member?.voice?.channelId) return "Join the same voice channel as LightCore.";
  if (c.member.voice.channelId !== player.voiceChannelId) return "You must be in the same voice channel as LightCore.";
  return null;
}

export async function ensurePlayer(x) {
  const c = context(x);
  if (!c.guild) throw new Error("Music commands can only be used in a server.");
  const voice = voiceChannel(x);
  if (!voice) throw new Error("Join a voice channel first.");

  let p = getPlayer(x);
  if (p?.voiceChannelId && p.voiceChannelId !== voice.id) throw new Error("You must be in the same voice channel as LightCore.");

  if (!p) {
    const raw = await c.client.music.createPlayer({ guildId: c.guild.id, textChannelId: c.channel.id, voiceChannelId: voice.id });
    if (!raw) throw new Error("Music is temporarily unavailable: all Lavalink nodes are offline or unreachable.");
    p = new PlayerManager(raw);
  }

  if (!p.isConnected) await p.connect();
  return p;
}

export function getPlayer(x) {
  const c = context(x);
  const raw = c.guild && c.client.music?.getPlayer(c.guild.id);
  return raw ? new PlayerManager(raw) : null;
}

export async function resolveTrack(x, query, source) {
  const c = context(x);
  const q = String(query || "").trim();
  if (!q) throw new Error("Give me a song name or URL.");
  const src = source || musicSettings(x).source || "ytmsearch";
  const result = c.client.music.isUrl(q)
    ? await c.client.music.resolve(q, { source: src, requester: c.user })
    : await c.client.music.search(q, { source: src, requester: c.user });
  if (!result?.tracks?.length) throw new Error("No playable results were found.");
  return result;
}

export async function enqueue(x, result, position) {
  const p = await ensurePlayer(x);
  const idle = !p.currentTrack && p.queueSize === 0;

  if (result.loadType === "playlist") {
    await p.addTracks(result.tracks, position);
  } else {
    await p.addTracks(result.tracks[0], position);
  }

  if (idle && !p.isPlaying) {
    const waitForPlayback = async (ms = 10000) => {
      const started = Date.now();
      while (Date.now() - started < ms) {
        if (p.isPlaying && p.currentTrack) return true;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      return false;
    };

    try {
      // lavalink-client's supported queue flow is: queue.add() -> player.play().
      await Promise.race([
        p.play(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Playback start timed out.")), 12000))
      ]);

      // A successful REST update is not the same thing as audio actually starting.
      if (!(await waitForPlayback(10000))) {
        throw new Error("Lavalink accepted the track but audio did not start.");
      }
    } catch (primaryError) {
      // YouTube playback can fail even when search succeeds. Retry the exact
      // title/artist on SoundCloud before telling the user playback failed.
      const first = result.tracks?.[0];
      const title = first?.info?.title || "";
      const author = first?.info?.author || "";
      const fallbackQuery = [author, title].filter(Boolean).join(" ").trim();

      if (!fallbackQuery) throw primaryError;

      try {
        const fallback = await x.client.music.search(fallbackQuery, {
          source: "scsearch",
          requester: context(x).user
        });
        const fallbackTrack = fallback?.tracks?.find(track => track?.info?.identifier);

        if (!fallbackTrack) throw primaryError;

        // Stop the failed current track without destroying the voice player or
        // clearing the user's remaining queue, then put the fallback first.
        await p.stopPlaying(false, false).catch(() => {});
        await p.addTracks(fallbackTrack, 0);

        await Promise.race([
          p.play(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("SoundCloud fallback playback timed out.")), 12000))
        ]);

        if (!(await waitForPlayback(10000))) {
          throw new Error("SoundCloud fallback loaded but audio did not start.");
        }
      } catch {
        throw new Error(
          "I found the song, but Lavalink could not start audio. " +
          "The primary source failed and the backup source also failed."
        );
      }
    }
  }

  return { p, count: result.tracks?.length || 1, first: result.tracks[0] };
}

export function nowPlayingEmbed(p) {
  const t = p?.currentTrack;
  if (!t) return musicContainer({
    title: E("music", "🎵") + " **LIGHTCORE • NOTHING PLAYING**",
    description: "Use .play <song> to start listening.",
    accent: ERROR_COLOR
  });

  const duration = Number(t.info.duration || 0);
  const position = Number(p.position || 0);
  const ratio = duration ? Math.min(1, Math.max(0, position / duration)) : 0;
  const length = 18;
  const filled = Math.round(ratio * length);
  const bar = "━".repeat(Math.max(0, filled)) + "🔘" + "━".repeat(Math.max(0, length - filled));
  const artwork = t.info.artworkUrl || t.info.thumbnail || t.info.image;
  const autoplay = p.getData?.("autoplayEnabled") === true;
  const stay247 = p.getData?.("stay247") === true;

  const container = musicContainer({
    title: E("music", "🎵") + " **LIGHTCORE • NOW PLAYING**",
    description: "### " + (t.info.title || "Unknown") + "\n" + (t.info.author || "Unknown artist"),
    sections: [
      E("timer", "⏱️") + " **Progress**\n" + bar + "\n" + formatDuration(position) + " / " + formatDuration(duration),
      E("status", "🔊") + " **Volume:** " + (p.volume ?? 100) + "%  •  " + E("list", "📜") + " **Queue:** " + (p.queueSize ?? 0) + " upcoming  •  🔁 **Loop:** " + (p.repeatMode || "off"),
      E("reload", "🔄") + " **Autoplay:** " + (autoplay ? "ON" : "OFF") + "  •  ♾️ **24/7:** " + (stay247 ? "ON" : "OFF")
    ],
    components: controlRows(p)
  });

  if (artwork) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(E("music", "🎵") + " **Playing now**\n" + (t.info.title || "Unknown") + "\n" + (t.info.author || "Unknown artist")))
        .setThumbnailAccessory(thumbnail => thumbnail.setDescription("Track artwork").setURL(artwork))
    );
  }
  return container;
}

export function controlRows(p) {
  const autoplay = p?.getData?.("autoplayEnabled") === true;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_previous").setLabel("Prev").setEmoji(emojiObject("left", "◀️")).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_rewind").setLabel("10s").setEmoji("⏪").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_pause").setLabel(p?.isPaused ? "Play" : "Pause").setEmoji(emojiObject(p?.isPaused ? "play" : "pause", p?.isPaused ? "▶️" : "⏸️")).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("lc_music_forward").setLabel("10s").setEmoji("⏩").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_skip").setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_shuffle").setLabel("Shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_loop").setLabel(p?.repeatMode === "track" ? "Loop ON" : "Loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_volume_down").setLabel("Vol −").setEmoji("🔉").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_volume_up").setLabel("Vol +").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_queue").setLabel("Queue").setEmoji(emojiObject("list", "📜")).setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_stop").setLabel("Stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("lc_music_autoplay").setLabel(autoplay ? "Autoplay ON" : "Autoplay").setEmoji(emojiObject("reload", "🔄")).setStyle(autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_settings").setLabel("Settings").setEmoji("⚙️").setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function queueEmbed(p, page = 1) {
  const tracks = p?.player?.queue?.tracks || p?.queue?.tracks || [];
  const current = p?.currentTrack;
  const perPage = 8;
  const pages = Math.max(1, Math.ceil(tracks.length / perPage));
  const pg = Math.max(1, Math.min(Number(page) || 1, pages));
  const start = (pg - 1) * perPage;
  const body = tracks.slice(start, start + perPage).map((t, i) => (start + i + 1) + ". **" + (t.info.title || "Unknown") + "** — " + formatDuration(t.info.duration)).join("\n") || "No songs are waiting.";
  return musicContainer({
    title: E("list", "📜") + " **LIGHTCORE • QUEUE**",
    description: current ? E("music", "🎵") + " **Playing:** " + (current.info.title || "Unknown") + "\n\n" + body : body,
    sections: [E("total", "📦") + " " + tracks.length + " queued • page " + pg + "/" + pages]
  });
}

export function settingsRows(settings) {
  const on = v => v ? "ON" : "OFF";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_setting_autoplay").setLabel("Autoplay: " + on(settings.autoplay)).setEmoji(emojiObject("reload", "🔄")).setStyle(settings.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_announce").setLabel("Announcements: " + on(settings.announceSongs)).setEmoji("📢").setStyle(settings.announceSongs ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_voteskip").setLabel("Vote Skip: " + on(settings.voteSkip)).setEmoji("🗳️").setStyle(settings.voteSkip ? ButtonStyle.Success : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_setting_247").setLabel("24/7: " + on(settings.mode247)).setEmoji("♾️").setStyle(settings.mode247 ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_source").setLabel("Source: " + (settings.source === "ytmsearch" ? "YouTube Music" : settings.source)).setEmoji(emojiObject("music", "🎵")).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_dj").setLabel("DJ Role").setEmoji(emojiObject("owner", "👑")).setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function settingsContainer(settings, notice = "") {
  const s = settings || {};
  return musicContainer({
    title: E("music", "🎵") + " **LIGHTCORE • MUSIC SETTINGS**",
    description: notice ? E("check", "✅") + " **" + notice + "**" : "Rythm-style playback controls, access and search settings.",
    sections: [
      E("music", "🎵") + " **PLAYBACK**\n" + E("reload", "🔄") + " Autoplay: **" + (s.autoplay ? "ON" : "OFF") + "**  •  📢 Announcements: **" + (s.announceSongs ? "ON" : "OFF") + "**  •  🗳️ Vote Skip: **" + (s.voteSkip ? "ON" : "OFF") + "**",
      "♾️ **STAY CONNECTED**\n24/7: **" + (s.mode247 ? "ON" : "OFF") + "**  •  🔎 Source: **" + (s.source === "ytmsearch" ? "YouTube Music" : s.source) + "**\n" + E("owner", "👑") + " DJ role: " + (s.djRole ? "<@&" + s.djRole + ">" : "Everyone can control")
    ],
    components: settingsRows(s)
  });
}

export function sourceFromFlag(value) {
  const v = String(value || "").toLowerCase();
  const map = {
    yt: "ytsearch",
    youtube: "ytsearch",
    ytm: "ytmsearch",
    youtubemusic: "ytmsearch",
    sp: "spsearch",
    spotify: "spsearch",
    sc: "scsearch",
    soundcloud: "scsearch"
  };
  return map[v] || "ytmsearch";
}

export function sourceMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("lc_music_source_select").setPlaceholder("🎧 Choose a music source").addOptions(
      { label: "YouTube Music", value: "ytmsearch", emoji: emojiObject("youtube", "▶️") },
      { label: "YouTube", value: "ytsearch", emoji: emojiObject("youtube", "📺") },
      { label: "Spotify", value: "spsearch", emoji: emojiObject("spotify", "🟢") },
      { label: "SoundCloud", value: "scsearch", emoji: "🟠" }
    )
  );
}
