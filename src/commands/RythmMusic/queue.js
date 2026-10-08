import { command, getPlayer, queueEmbed, reply, safeReply, v2Payload } from "#utils/RythmCommands";

const run = async x => {
  const p = getPlayer(x);
  if (!p || (!p.currentTrack && p.queueSize === 0)) return safeReply(x, "📜 Queue", "The queue is empty.", 0xED4245);
  const page = x.interaction?.options.getInteger("page") || Number(x.args?.[0]) || 1;
  return reply(x, v2Payload(queueEmbed(p, page), { ephemeral: Boolean(x.interaction) }));
};

export default command({
  name: "queue",
  description: "View the music queue",
  aliases: ["q"],
  options: [{ name: "page", description: "Queue page", type: 4, required: false, min_value: 1 }],
  execute: run,
  slashExecute: run
});
