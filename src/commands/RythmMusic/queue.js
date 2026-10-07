import { command, getPlayer, queueEmbed, reply, safeReply } from "#utils/RythmCommands";
const run=async x=>{const p=getPlayer(x);if(!p||!p.currentTrack)return safeReply(x,"📜 Queue","The queue is empty.",0xED4245);const page=x.interaction?.options.getInteger("page")||Number(x.args?.[0])||1;return reply(x,{embeds:[queueEmbed(p,page)]})};
export default command({name:"queue",description:"View the music queue",aliases:["q"],options:[{name:"page",description:"Queue page",type:4,required:false,min_value:1}],execute:run,slashExecute:run});
