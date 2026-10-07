import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🎵 Pause","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🎵 Pause","Nothing is playing.",0xED4245);if(p.isPaused)await p.resume();else await p.pause();return safeReply(x,p.isPaused?"⏸️ Paused":"▶️ Resumed",p.currentTrack?.info?.title||"Current track")};
export default command({name:"pause",description:"Pause or resume the current track",dj:true,execute:run,slashExecute:run});
