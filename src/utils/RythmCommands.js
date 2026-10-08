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
  slash = false,
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

  const ctx = context(x);
  let pending = null;
  try {
    const loading = v2Payload(musicContainer({
      title: "🔎 LIGHTCORE • SEARCHING",
      description: "Searching for **" + q.slice(0, 180) + "** and preparing the voice connection..."
    }));
    if (ctx.slash) {
      if (!ctx.source.deferred && !ctx.source.replied) await ctx.source.deferReply();
    } else {
      pending = await ctx.source.reply(loading);
    }

    const result = await resolveTrack(x, q, opts.source);
    const added = await enqueue(x, result, opts.position);
    const first = added.first;

    let payload;
    if (result.loadType === "playlist") {
      payload = v2Payload(musicContainer({
        title: "📥 LIGHTCORE • ADDED TO QUEUE",
        description: "Added **" + added.count + " tracks** to the queue."
      }));
    } else {
      payload = v2Payload(nowPlayingEmbed(added.p));
    }

    if (ctx.slash) return ctx.source.editReply(payload);
    return pending?.edit ? pending.edit(payload) : ctx.source.reply(payload);
  } catch (error) {
    const message = error?.message || "Music request failed.";
    const payload = v2Payload(musicContainer({
      title: "⚠️ LIGHTCORE • MUSIC ERROR",
      description: message,
      accent: 0xED4245
    }));
    if (ctx.slash) {
      if (ctx.source.deferred || ctx.source.replied) return ctx.source.editReply(payload);
      return ctx.source.reply(payload);
    }
    if (pending?.edit) return pending.edit(payload);
    return ctx.source.reply(payload);
  }
}
