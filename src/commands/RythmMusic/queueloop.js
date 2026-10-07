import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🔁 Queue Loop","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🔁 Queue Loop","Nothing is playing.",0xED4245);const mode=p.repeatMode==="queue"?"off":"queue";await p.setRepeatMode(mode);return safeReply(x,"🔁 Queue Loop",mode==="queue"?"Entire queue will repeat.":"Queue loop disabled.")};
export default command({name:"queueloop",description:"Loop the entire queue",aliases:["qloop"],dj:true,execute:run,slashExecute:run});
