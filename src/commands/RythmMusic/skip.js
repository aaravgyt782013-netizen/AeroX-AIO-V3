import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🎵 Skip","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🎵 Skip","Nothing is playing.",0xED4245);await p.skip();return safeReply(x,"⏭️ Skipped","Moving to the next track.")};
export default command({name:"skip",description:"Skip the current track",aliases:["s","next"],dj:true,execute:run,slashExecute:run});
