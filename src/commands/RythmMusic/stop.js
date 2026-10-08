import { command, getPlayer, djError, safeReply, context } from "#utils/RythmCommands";

const run = async x => {
  const e = djError(x);
  if (e) return safeReply(x, "🎵 Stop", "❌ " + e, 0xED4245);

  const p = getPlayer(x);
  if (!p) return safeReply(x, "🎵 Stop", "Nothing is playing.", 0xED4245);

  const c = context(x);
  c.client.db.guild.setAutoplay(c.guild.id, false);
  c.client.db.guild.setMusicSettings(c.guild.id, { mode247: false });

  p.setData("autoplayEnabled", false);
  p.setData("stayAlive", false);
  p.setData("stay247", false);

  await p.stop().catch(() => {});
  return safeReply(x, "⏹️ Stopped", "Playback stopped, the queue was cleared, and autoplay/24/7 were turned off.");
};

export default command({
  name: "disconnect",
  description: "Stop playback and disconnect LightCore",
  aliases: ["dc", "leave", "stop"],
  dj: true,
  execute: run,
  slashExecute: run
});
