import { command, getPlayer, djError, safeReply } from "#utils/RythmCommands";
const run=async x=>{const e=djError(x);if(e)return safeReply(x,"🎵 Force Skip","❌ "+e,0xED4245);const p=getPlayer(x);if(!p)return safeReply(x,"🎵 Force Skip","Nothing is playing.",0xED4245);await p.skip();return safeReply(x,"⏭️ Force Skipped","The current track was skipped.")};
export default command({name:"forceskip",description:"Force skip the current track",aliases:["fs","fskip"],dj:true,execute:run,slashExecute:run});
