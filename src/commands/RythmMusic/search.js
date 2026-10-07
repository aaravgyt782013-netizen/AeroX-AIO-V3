import { command, getArgs, resolveTrack, reply, safeReply, ensurePlayer } from "#utils/RythmCommands";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
const run=async x=>{
 const q=x.interaction?.options.getString("query")||getArgs(x).join(" ");
 if(!q)return safeReply(x,"🔎 Search","Give me a search query.",0xED4245);
 const r=await resolveTrack(x,q,"ytmsearch");
 const p=await ensurePlayer(x);
 p.player.set("searchSession",{userId:x.interaction?.user?.id||x.message.author.id,tracks:r.tracks.slice(0,5),createdAt:Date.now()});
 const opts=r.tracks.slice(0,5).map((t,i)=>({label:(t.info.title||"Unknown").slice(0,100),description:(t.info.author||"Unknown").slice(0,100),value:String(i)}));
 const row=new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("lc_music_search_select").setPlaceholder("Choose a track").addOptions(opts));
 return reply(x,{content:"🔎 **Search Results** — choose a track to add it to the queue.",components:[row]});
};
export default command({name:"search",description:"Search for tracks",options:[{name:"query",description:"Search query",type:3,required:true}],execute:run,slashExecute:run});
