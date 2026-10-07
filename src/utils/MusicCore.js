import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";

export const MUSIC_COLOR = 0x5865F2;
export const ERROR_COLOR = 0xED4245;

export function formatDuration(ms) {
  if (ms == null || ms < 0 || !Number.isFinite(Number(ms))) return "LIVE";
  const total = Math.floor(Number(ms) / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

export function parseTime(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^\d+:\d+(?::\d+)?$/.test(v)) {
    const a = v.split(":").map(Number);
    return (a.length === 2 ? a[0]*60+a[1] : a[0]*3600+a[1]*60+a[2]) * 1000;
  }
  let total = 0, m;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hour|hours|m|min|minute|minutes|s|sec|second|seconds)/g;
  while ((m = re.exec(v))) total += Number(m[1]) * (m[2].startsWith("h") ? 3600000 : m[2].startsWith("m") ? 60000 : 1000);
  return total || (/^\d+$/.test(v) ? Number(v)*1000 : null);
}

export function context(x) {
  if (x.interaction) return { client:x.client, source:x.interaction, guild:x.interaction.guild, member:x.interaction.member, user:x.interaction.user, channel:x.interaction.channel, args:[], slash:true };
  return { client:x.client, source:x.message, guild:x.message.guild, member:x.message.member, user:x.message.author, channel:x.message.channel, args:x.args||[], slash:false };
}

export async function reply(x, payload) {
  const c = context(x);
  return c.slash ? (c.source.replied || c.source.deferred ? c.source.editReply(payload) : c.source.reply(payload)) : c.source.reply(payload);
}

export async function safeReply(x, title, description, color=MUSIC_COLOR) {
  return reply(x, { embeds:[new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)] });
}

export function voiceChannel(x) { return context(x).member?.voice?.channel || null; }

export function getPlayer(x) {
  const c=context(x), raw=c.guild && c.client.music?.getPlayer(c.guild.id);
  return raw ? new PlayerManager(raw) : null;
}

export function musicSettings(x) {
  const c=context(x);
  try {
    const s=c.client.db.guild.getMusicSettings(c.guild.id);
    return { djRole:s.djRole ?? s.dj_role ?? null, autoplay:!!s.autoplay, announceSongs:s.announceSongs !== false, voteSkip:!!s.voteSkip, source:s.source || "ytmsearch", mode247:!!s.mode247 };
  } catch {
    return { djRole:null, autoplay:false, announceSongs:true, voteSkip:false, source:"ytmsearch", mode247:false };
  }
}

export function djError(x) {
  const c=context(x);
  if (!c.guild) return "Server only.";
  if (c.member?.permissions?.has("Administrator") || c.member?.permissions?.has("ManageGuild")) return null;
  const role=musicSettings(x).djRole;
  return role && !c.member?.roles?.cache?.has(role) ? "You need the configured DJ role to control music." : null;
}

export async function ensurePlayer(x) {
  const c=context(x);
  if (!c.guild) throw Error("Music commands can only be used in a server.");
  const voice=voiceChannel(x);
  if (!voice) throw Error("Join a voice channel first.");
  let p=getPlayer(x);
  if (p?.voiceChannelId && p.voiceChannelId !== voice.id) throw Error("You must be in the same voice channel as LightCore.");
  if (!p) {
    const raw=await c.client.music.createPlayer({guildId:c.guild.id,textChannelId:c.channel.id,voiceChannelId:voice.id});
    if (!raw) throw Error("Music is unavailable right now: no Lavalink node is connected.");
    p=new PlayerManager(raw);
  }
  if (!p.isConnected) await p.connect();
  return p;
}

export async function resolveTrack(x, query, source) {
  const c=context(x), q=String(query||"").trim();
  if (!q) throw Error("Give me a song name or URL.");
  const src=source || musicSettings(x).source || "ytmsearch";
  const result=c.client.music.isUrl(q) ? await c.client.music.resolve(q,{source:src,requester:c.user}) : await c.client.music.search(q,{source:src,requester:c.user});
  if (!result?.tracks?.length) throw Error("No results found.");
  return result;
}

export async function enqueue(x, result, position) {
  const p=await ensurePlayer(x);
  const idle=!p.currentTrack && p.queueSize===0;
  if (result.loadType==="playlist") await p.addTracks(result.tracks, position);
  else await p.addTracks(result.tracks[0], position);
  if (idle) await p.play();
  return { p, count:result.tracks?.length||1, first:result.tracks[0] };
}

export function nowPlayingEmbed(p) {
  const t=p?.currentTrack;
  if (!t) return new EmbedBuilder().setColor(ERROR_COLOR).setTitle("🎵 Nothing is playing");
  const d=Number(t.info.duration||0), pos=Number(p.position||0), n=d ? Math.round(Math.min(1,pos/d)*20) : 0;
  return new EmbedBuilder().setColor(MUSIC_COLOR).setTitle("🎵 LightCore • Now Playing")
    .setDescription(`**[${t.info.title||"Unknown"}](${t.info.uri||""})**\n${t.info.author||"Unknown artist"}`)
    .addFields(
      {name:"Progress",value:`${"▰".repeat(n)}${"▱".repeat(20-n)}\n${formatDuration(pos)} / ${formatDuration(d)}`},
      {name:"Volume",value:`${p.volume??100}%`,inline:true},
      {name:"Loop",value:p.repeatMode||"off",inline:true},
      {name:"Queue",value:`${p.queueSize} upcoming`,inline:true}
    );
}

export function controlRows(p) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_previous").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_pause").setEmoji(p?.isPaused?"▶️":"⏸️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("lc_music_skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lc_music_shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_loop").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_volume_down").setEmoji("🔉").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_volume_up").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lc_music_queue").setEmoji("📜").setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function queueEmbed(p, page=1) {
  const tracks=p?.player?.queue?.tracks || p?.queue?.tracks || [];
  const current=p?.currentTrack;
  const per=5, pages=Math.max(1,Math.ceil(tracks.length/per)), pg=Math.max(1,Math.min(Number(page)||1,pages));
  const body=tracks.slice((pg-1)*per,pg*per).map((t,i)=>`**${(pg-1)*per+i+1}.** [${t.info.title||"Unknown"}](${t.info.uri||""}) — ${formatDuration(t.info.duration)}`).join("\n") || "No songs are waiting.";
  return new EmbedBuilder().setColor(MUSIC_COLOR).setTitle("📜 LightCore • Queue").setDescription((current?`🎵 **Playing:** [${current.info.title}](${current.info.uri||""})\n\n`:"")+body).setFooter({text:`${tracks.length} queued • page ${pg}/${pages}`});
}

export function sourceFromFlag(value) {
  const m={yt:"ytsearch",youtube:"ytsearch",ytm:"ytmsearch",youtubemusic:"ytmsearch",sp:"spsearch",spotify:"spsearch",sc:"scsearch",soundcloud:"scsearch"};
  return m[String(value||"").toLowerCase()] || value || "ytmsearch";
}
