import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits } from "discord.js";
import musicSettings from "./settings.js";
class AutoplayCommand extends Command {
  constructor(){ super({name:"autoplay",description:"Toggle music autoplay",usage:"autoplay [on|off]",category:"music",userPermissions:[PermissionFlagsBits.ManageGuild],aliases:["auto"],cooldown:3}); }
  async execute({message,args}){ return musicSettings.apply(message,"autoplay",args[0]||""); }
}
export default new AutoplayCommand();
