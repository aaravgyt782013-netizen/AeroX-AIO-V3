import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";

export const MUSIC_COLOR = 0x5865F2;
export const ERROR_COLOR = 0xED4245;
export const SUCCESS_COLOR = 0x57F287;

export const v2Flags = MessageFlags.IsComponentsV2;

export function formatDuration(ms) {
  if (ms == null || ms < 0 || !Number.isFinite(Number(ms))) return "LIVE";
  const total = Math.floor(Number(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
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
  while ((match = re.exec(v))) {
    total += Number(match[1]) * (
      match[2].startsWith("h") ? 3600000 :
      match[2].startsWith("m") ? 60000 : 1000
    );
  }
  return total || (/^\d+$/.test(v) ? Number(v) * 1000 : null);
}

export function context(x) {
  if (x.interaction) {
    return {
      client: x.client,
      source: x.interaction,
      guild: x.interaction.guild,
      member: x.interaction.member,
      user: x.interaction.user,
      channel: x.interaction.channel,
      args: [],
      slash: true
    };
  }
  return {
    client: x.client,
    source: x.message,
    guild: x.message.guild,
    member: x.message.member,
    user: x.message.author,
    channel: x.message.channel,
    args: x.args || [],
    slash: false
  };
}

export async function reply(x, payload) {
  const c = context(x);
  if (c.slash) {
    return c.source.replied || c.source.deferred
      ? c.source.editReply(payload)
      : c.source.reply(payload);
  }
  return c.source.reply(payload);
}

function text(value) {
  return new TextDisplayBuilder().setContent(String(value ?? ""));
}

export function musicContainer({
  title = "🎵 LightCore Music",
  description = "",
  sections = [],
  components = [],
  accent = MUSIC_COLOR
} = {}) {
  const container = new ContainerBuilder().setAccentColor(accent);
  container.addTextDisplayComponents(text(title));
  if (description) container.addTextDisplayComponents(text(description));
  for (const section of sections) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(section));
  }
  if (components.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    for (const component of components) {
      container.addActionRowComponents(component);
    }
  }
  return container;
}

export function v2Payload(container, extra = {}) {
  return {
    ...extra,
    components: [container],
    flags: v2Flags
  };
}

export async function safeReply(x, title, description, color = MUSIC_COLOR) {
  return reply(x, v2Payload(musicContainer({
    title,
    description,
    accent: color
  })));
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
    return {
      djRole: null,
      autoplay: false,
      announceSongs: true,
      voteSkip: false,
      source: "ytmsearch",
      mode247: false
    };
  }
}

export function djError(x) {
  const c = context(x);
  if (!c.guild) return "Server only.";
  if (c.member?.permissions?.has("Administrator") || c.member?.permissions?.has("ManageGuild")) return null;
  const role = musicSettings(x).djRole;
  return role && !c.member?.roles?.cache?.has(role)
    ? "You need the configured DJ role to control music."
    : null;
}

export async function ensurePlayer(x) {
  const c = context(x);
  if (!c.guild) throw new Error("Music commands can only be used in a server.");
  const voice = voiceChannel(x);
  if (!voice) throw new Error("Join a voice channel first.");

  let p = getPlayer(x);
  if (p?.voiceChannelId && p.voiceChannelId !== voice.id) {
    throw new Error("You must be in the same voice channel as LightCore.");
  }

  if (!p) {
    const raw = await c.client.music.createPlayer({
      guildId: c.guild.id,
      textChannelId: c.channel.id,
      voiceChannelId: voice.id
    });
    if (!raw) {
      throw new Error("Music is temporarily unavailable: no Lavalink node is connected.");
    }
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

  if (idle && !p.isPlaying) await p.play();
  return { p, count: result.tracks?.length || 1, first: result.tracks[0] };
}

export function nowPlayingEmbed(p) {
  const t = p?.currentTrack;
  if (!t) {
    return musicContainer({
      title: "🎵 Nothing is playing",
      description: "Use `.play <song>` to start listening.",
      accent: ERROR_COLOR
    });
  }

  const duration = Number(t.info.duration || 0);
  const position = Number(p.position || 0);
  const ratio = duration ? Math.min(1, Math.max(0, position / duration)) : 0;
  const length = 20;
  const filled = Math.round(ratio * length);
  const bar = "━".repeat(Math.max(0, filled)) + "🔘" + "━".repeat(Math.max(0, length - filled));

  return musicContainer({
    title: "🎵 LightCore • NOW PLAYING",
    description: `**${t.info.title || "Unknown"}**\n${t.info.author || "Unknown artist"}`,
    sections: [
      `⏱️ **Progress**\n${bar}\n${formatDuration(position)} / ${formatDuration(duration)}`,
      `🔊 **Volume:** ${p.volume ?? 100}%   •   🔁 **Loop:** ${p.repeatMode || "off"}   •   📜 **Queue:** ${p.queueSize} upcoming`,
      "✨ **LightCore Music** • Rythm-style playback controls"
    ],
    components: controlRows(p)
  });
}

export function controlRows(p) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_previous").setLabel("Prev").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_rewind").setLabel("10s").setEmoji("⏪").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_pause").setLabel(p?.isPaused ? "Play" : "Pause").setEmoji(p?.isPaused ? "▶️" : "⏸️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("lc_music_forward").setLabel("10s").setEmoji("⏩").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_skip").setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_shuffle").setLabel("Shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_loop").setLabel("Loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_volume_down").setLabel("Vol −").setEmoji("🔉").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_volume_up").setLabel("Vol +").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_queue").setLabel("Queue").setEmoji("📜").setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function queueEmbed(p, page = 1) {
  const tracks = p?.player?.queue?.tracks || p?.queue?.tracks || [];
  const current = p?.currentTrack;
  const perPage = 6;
  const pages = Math.max(1, Math.ceil(tracks.length / perPage));
  const pg = Math.max(1, Math.min(Number(page) || 1, pages));
  const start = (pg - 1) * perPage;

  const body = tracks.slice(start, start + perPage)
    .map((t, i) => `${start + i + 1}. **${t.info.title || "Unknown"}** — ${formatDuration(t.info.duration)}`)
    .join("\n") || "No songs are waiting.";

  return musicContainer({
    title: "📜 LightCore • QUEUE",
    description: current ? `🎵 **Playing:** ${current.info.title || "Unknown"}\n\n${body}` : body,
    sections: [`📦 ${tracks.length} queued • page ${pg}/${pages}`]
  });
}

export function settingsRows(settings) {
  const on = v => v ? "ON" : "OFF";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_setting_autoplay").setLabel(`Autoplay: ${on(settings.autoplay)}`).setEmoji("🔄").setStyle(settings.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_announce").setLabel(`Announcements: ${on(settings.announceSongs)}`).setEmoji("📢").setStyle(settings.announceSongs ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_voteskip").setLabel(`Vote Skip: ${on(settings.voteSkip)}`).setEmoji("🗳️").setStyle(settings.voteSkip ? ButtonStyle.Success : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_setting_247").setLabel(`24/7: ${on(settings.mode247)}`).setEmoji("♾️").setStyle(settings.mode247 ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_source").setLabel(`Source: ${settings.source === "ytmsearch" ? "YouTube Music" : settings.source}`).setEmoji("🔎").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_setting_dj").setLabel("DJ Role").setEmoji("👑").setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function settingsContainer(settings, notice = "") {
  const s = settings || {};
  return musicContainer({
    title: "🎵 LIGHTCORE • MUSIC SETTINGS",
    description: notice ? `✅ **${notice}**` : "Configure playback, access and search behavior from one panel.",
    sections: [
      `🎶 **Playback**\n🔄 Autoplay: **${s.autoplay ? "ON" : "OFF"}**\n📢 Announcements: **${s.announceSongs ? "ON" : "OFF"}**\n🗳️ Vote Skip: **${s.voteSkip ? "ON" : "OFF"}**`,
      `♾️ **Stay Connected**\n24/7 mode: **${s.mode247 ? "ON" : "OFF"}**\n🔎 Source: **${s.source === "ytmsearch" ? "YouTube Music" : s.source}**`,
      `👑 **Access**\nDJ role: ${s.djRole ? "<@&" + s.djRole + ">" : "Everyone can control music"}`,
      "💡 **Tip:** Autoplay ON keeps the player alive and automatically finds another song when the queue ends."
    ],
    components: settingsRows(s)
  });
}

export function sourceMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("lc_music_source_select")
      .setPlaceholder("🎧 Choose a music source")
      .addOptions(
        { label: "YouTube Music", value: "ytmsearch", emoji: "▶️" },
        { label: "YouTube", value: "ytsearch", emoji: "📺" },
        { label: "Spotify", value: "spsearch", emoji: "🟢" },
        { label: "SoundCloud", value: "scsearch", emoji: "🟠" }
      )
  );
}

export function sourceFromFlag(value) {
  const m = {
    yt: "ytsearch", youtube: "ytsearch",
    ytm: "ytmsearch", youtubemusic: "ytmsearch",
    sp: "spsearch", spotify: "spsearch",
    sc: "scsearch", soundcloud: "scsearch"
  };
  return m[String(value || "").toLowerCase()] || value || "ytmsearch";
}
