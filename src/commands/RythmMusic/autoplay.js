import { command, musicSettings, safeReply } from "#utils/RythmCommands";
const run=async x=>{const guild=x.interaction?.guild||x.message.guild;const next=!musicSettings(x).autoplay;x.client.db.guild.setAutoplay(guild.id,next);const p=x.client.music.getPlayer(guild.id);p?.set("autoplayEnabled",next); client.music?.refreshVoiceStayAlive?.(guild.id, true);return safeReply(x,"🔄 Autoplay",next?"Autoplay enabled.":"Autoplay disabled.")};
export default command({name:"autoplay",description:"Toggle autoplay",execute:run,slashExecute:run});
