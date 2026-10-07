import { EmbedBuilder } from "discord.js";
import { ensurePlayer, getPlayer, resolveTrack, enqueue, reply, safeReply, djError, context, musicSettings, parseTime, formatDuration, nowPlayingEmbed, controlRows, queueEmbed, sourceFromFlag } from "#utils/MusicCore";

export { ensurePlayer, getPlayer, resolveTrack, enqueue, reply, safeReply, djError, context, musicSettings, parseTime, formatDuration, nowPlayingEmbed, controlRows, queueEmbed, sourceFromFlag };

export function command({name,description,aliases=[],cooldown=3,voiceRequired=false,dj=false,options=[],slash=true,execute,slashExecute}) {
  const out={name,description,usage:name,aliases,category:"music",cooldown,voiceRequired,sameVoiceRequired:false,enabledSlash:slash,slashData:slash?{name,description,options}:null,execute};
  if(slash) out.slashExecute=slashExecute||execute;
  out._needsDJ=dj;
  return out;
}

export function getArgs(x) { return context(x).args || []; }

export async function runSafe(x, fn) {
  try { return await fn(); }
  catch(e) { return safeReply(x,"🎵 LightCore Music","❌ "+(e?.message||"Music command failed."),0xED4245); }
}

export async function playQuery(x, query, opts={}) {
  const result=await resolveTrack(x,query,opts.source);
  const added=await enqueue(x,result,opts.position);
  const first=added.first;
  const text=result.loadType==="playlist"
    ? `Added **${added.count} tracks** from **${first?.info?.title||"playlist"}** to the queue.`
    : `Added **[${first?.info?.title||"Unknown"}](${first?.info?.uri||""})** — ${formatDuration(first?.info?.duration)}`;
  return safeReply(x,"🎵 Added to Queue",text);
}

export function slashString(name,description,required=true) {
  return {name,description,type:3,required};
}
export function slashInteger(name,description,required=false,min=1) {
  return {name,description,type:4,required,min_value:min};
}
