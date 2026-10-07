import { Command } from "#structures/classes/Command";
class VoteSkipCommand extends Command {
  constructor(){ super({name:"voteskip",description:"Toggle vote skip for music",usage:"voteskip [on|off]",category:"music",cooldown:3}); }
  async execute({message,args}){ const {db}=await import("#database/DatabaseManager"); const v=(args[0]||"").toLowerCase(); if(!["on","off","enable","disable"].includes(v)) return message.reply("Use: .voteskip on or .voteskip off"); db.guild.setVoteSkip(message.guild.id,["on","enable"].includes(v)); return message.reply("✅ Vote skip is now **"+(db.guild.getMusicSettings(message.guild.id).voteSkip?"ON":"OFF")+"**."); }
}
export default new VoteSkipCommand();
