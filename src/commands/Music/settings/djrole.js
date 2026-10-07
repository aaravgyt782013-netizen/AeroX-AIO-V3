import { Command } from "#structures/classes/Command";
import musicSettings from "./settings.js";
class DJRoleCommand extends Command {
  constructor(){ super({name:"djrole",description:"Set or remove the music DJ role",usage:"djrole [@role|off]",category:"music",aliases:["musicdj"],cooldown:3}); }
  async execute({message,args}){ return musicSettings.apply(message,"djrole",args.join(" ")); }
}
export default new DJRoleCommand();
