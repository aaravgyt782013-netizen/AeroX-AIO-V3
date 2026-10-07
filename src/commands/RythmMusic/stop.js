import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🎵 Stop","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🎵 Stop","Nothing is playing.",0xED4245);await p.stop();return safeReply(x,"⏹️ Stopped","Playback stopped and the queue was cleared.")};
export default command({name:"disconnect",description:"Disconnect and clear the music player",aliases:["dc","leave","stop"],dj:true,execute:run,slashExecute:run});
