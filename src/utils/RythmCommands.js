import {
  ensurePlayer,
  getPlayer,
  resolveTrack,
  enqueue,
  reply,
  safeReply,
  djError,
  context,
  musicSettings,
  parseTime,
  formatDuration,
  nowPlayingEmbed,
  controlRows,
  queueEmbed,
  sourceFromFlag,
  settingsRows,
  settingsContainer,
  sourceMenu,
  v2Payload,
  musicContainer
} from "#utils/MusicCore";

export {
  ensurePlayer, getPlayer, resolveTrack, enqueue, reply, safeReply, djError,
  context, musicSettings, parseTime, formatDuration, nowPlayingEmbed,
  controlRows, queueEmbed, sourceFromFlag, settingsRows, settingsContainer,
  sourceMenu, v2Payload, musicContainer
};

export function command({
  name,
  description,
  aliases = [],
  cooldown = 3,
  voiceRequired = false,
  dj = false,
  options = [],
  slash = true,
  execute,
  slashExecute
}) {
  const run = async x => {
    const c = context(x);
    if (voiceRequired && !c.member?.voice?.channel) {
      return safeReply(x, "🎵 LightCore Music", "Join a voice channel first.", 0xED4245);
    }
    if (dj) {
      const error = djError(x);
      if (error) return safeReply(x, "🎵 LightCore Music", "❌ " + error, 0xED4245);
    }
    try {
      return await execute(x);
    } catch (error) {
      return safeReply(x, "⚠️ LightCore Music", error?.message || "Music command failed.", 0xED4245);
    }
  };

  const slashRun = async x => {
    const c = context(x);
    if (voiceRequired && !c.member?.voice?.channel) {
      return safeReply(x, "🎵 LightCore Music", "Join a voice channel first.", 0xED4245);
    }
    if (dj) {
      const error = djError(x);
      if (error) return safeReply(x, "🎵 LightCore Music", "❌ " + error, 0xED4245);
    }
    try {
      return await (slashExecute || execute)(x);
    } catch (error) {
      return safeReply(x, "⚠️ LightCore Music", error?.message || "Music command failed.", 0xED4245);
    }
  };

  return {
    name,
    description,
    usage: name,
    aliases,
    category: "music",
    cooldown,
    voiceRequired,
    sameVoiceRequired: voiceRequired,
    enabledSlash: slash,
    slashData: slash ? { name, description, options } : null,
    execute: run,
    slashExecute: slashRun,
    _needsDJ: dj
  };
}

export function getArgs(x) {
  return context(x).args || [];
}

export async function runSafe(x, fn) {
  try {
    return await fn();
  } catch (error) {
    return safeReply(x, "⚠️ LightCore Music", error?.message || "Music command failed.", 0xED4245);
  }
}

export async function playQuery(x, query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) return safeReply(x, "🎵 Play", "Usage: .play <song name or URL>", 0xED4245);

  const result = await resolveTrack(x, q, opts.source);
  const added = await enqueue(x, result, opts.position);
  const first = added.first;
  const isNowPlaying = added.p.currentTrack?.info?.identifier === first?.info?.identifier;

  if (result.loadType === "playlist") {
    return safeReply(
      x,
      isNowPlaying ? "🎵 NOW PLAYING" : "📥 ADDED TO QUEUE",
      `Added **${added.count} tracks** to the queue.\nUse the controls on the music panel to manage playback.`
    );
  }

  const title = first?.info?.title || "Unknown track";
  const author = first?.info?.author || "Unknown artist";
  const duration = formatDuration(first?.info?.duration);

  return reply(x, v2Payload(nowPlayingEmbed(added.p), {
    // V2 messages cannot contain content/embeds/stickers.
    // The container itself is the complete message.
  }));
}
