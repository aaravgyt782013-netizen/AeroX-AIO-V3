import { command, getPlayer, safeReply } from "#utils/RythmCommands";
const run=async x=>{const p=getPlayer(x);if(!p)return safeReply(x,"🎵 Resume","Nothing is playing.",0xED4245);await p.resume();return safeReply(x,"▶️ Resumed",p.currentTrack?.info?.title||"Current track")};
export default command({name:"resume",description:"Resume playback",execute:run,slashExecute:run});
