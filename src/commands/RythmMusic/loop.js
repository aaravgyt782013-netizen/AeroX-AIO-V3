import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🔁 Loop","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🔁 Loop","Nothing is playing.",0xED4245);const mode=p.repeatMode==="track"?"off":"track";await p.setRepeatMode(mode);return safeReply(x,"🔁 Loop",mode==="track"?"Current track will repeat.":"Loop disabled.")};
export default command({name:"loop",description:"Loop the current track",aliases:["repeat"],dj:true,execute:run,slashExecute:run});
