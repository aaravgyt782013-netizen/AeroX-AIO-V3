import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits } from "discord.js";
class AnnounceCommand extends Command {
  constructor(){ super({name:"announce",description:"Toggle now-playing announcements",usage:"announce [on|off]",category:"music",userPermissions:[PermissionFlagsBits.ManageGuild],cooldown:3}); }
  async execute({message,args}){ const {db}=await import("#database/DatabaseManager"); const v=(args[0]||"").toLowerCase(); if(!["on","off","enable","disable"].includes(v)) return message.reply("Use: .announce on or .announce off"); db.guild.setAnnounceSongs(message.guild.id,["on","enable"].includes(v)); return message.reply("✅ Music announcements are now **"+(db.guild.getMusicSettings(message.guild.id).announceSongs?"ON":"OFF")+"**."); }
}
export default new AnnounceCommand();
