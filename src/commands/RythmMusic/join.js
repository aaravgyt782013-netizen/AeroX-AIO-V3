import { command, ensurePlayer, safeReply } from "#utils/RythmCommands";
const run=async x=>{await ensurePlayer(x);return safeReply(x,"🔊 Joined","Connected to your voice channel.")};
export default command({name:"join",description:"Join your voice channel",aliases:["summon","start"],voiceRequired:true,execute:run,slashExecute:run});
