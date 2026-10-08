import { command, getPlayer, reply, safeReply, nowPlayingEmbed, v2Payload } from "#utils/RythmCommands";

const run = async x => {
  const p = getPlayer(x);
  if (!p || !p.currentTrack) return safeReply(x, "🎵 Now Playing", "Nothing is playing.", 0xED4245);
  return reply(x, v2Payload(nowPlayingEmbed(p)));
};

export default command({
  name: "nowplaying",
  description: "Show the current track",
  aliases: ["np", "current"],
  execute: run,
  slashExecute: run
});
