import { command, getPlayer, reply, safeReply, nowPlayingEmbed, controlRows } from "#utils/RythmCommands";
const run=async x=>{const p=getPlayer(x);if(!p?.currentTrack)return safeReply(x,"🎛️ Controls","Nothing is playing.",0xED4245);return reply(x,{embeds:[nowPlayingEmbed(p)],components:controlRows(p)})};
export default command({name:"control",description:"Open interactive music controls",aliases:["ct","c"],execute:run,slashExecute:run});
