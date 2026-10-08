import { command, getPlayer, reply, safeReply, nowPlayingEmbed, v2Payload } from "#utils/RythmCommands";

const run = async x => {
  const p = getPlayer(x);
  if (!p?.currentTrack) return safeReply(x, "🎛️ Controls", "Nothing is playing.", 0xED4245);
  return reply(x, v2Payload(nowPlayingEmbed(p), { ephemeral: Boolean(x.interaction) }));
};

export default command({
  name: "control",
  description: "Open interactive Components V2 music controls",
  aliases: ["ct", "c"],
  execute: run,
  slashExecute: run
});
