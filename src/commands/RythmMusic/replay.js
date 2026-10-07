import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"↩️ Replay","❌ "+e,0xED4245);const p=getPlayer(x);if(!p?.currentTrack)return safeReply(x,"↩️ Replay","Nothing is playing.",0xED4245);await p.replay();return safeReply(x,"↩️ Replay","Restarted the current track.")};
export default command({name:"replay",description:"Restart the current track",dj:true,execute:run,slashExecute:run});
