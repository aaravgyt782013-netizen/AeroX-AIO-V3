import { Command } from "#structures/classes/Command";
import musicSettings from "./settings.js";
class AutoplayCommand extends Command {
  constructor(){ super({name:"autoplay",description:"Toggle music autoplay",usage:"autoplay [on|off]",category:"music",aliases:["auto"],cooldown:3}); }
  async execute({message,args}){ return musicSettings.apply(message,"autoplay",args[0]||""); }
}
export default new AutoplayCommand();
