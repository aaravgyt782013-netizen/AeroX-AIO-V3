import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🔀 Shuffle","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🔀 Shuffle","Nothing is playing.",0xED4245);await p.shuffleQueue();return safeReply(x,"🔀 Queue Shuffled","The queue has been randomized.")};
export default command({name:"shuffle",description:"Shuffle the queue",dj:true,execute:run,slashExecute:run});
