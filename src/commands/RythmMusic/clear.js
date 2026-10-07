import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🗑️ Queue","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🗑️ Queue","Nothing is playing.",0xED4245);await p.clearQueue();return safeReply(x,"🗑️ Queue Cleared","The current track remains playing.")};
export default command({name:"clear",description:"Clear the queue",aliases:["cq","clearqueue"],dj:true,execute:run,slashExecute:run});
