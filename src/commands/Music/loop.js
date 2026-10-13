import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "loop",
  aliases: [],
  description: "Set track or queue repeat mode.",
  usage: "loop <off|track|queue>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["loop", ...(context.args || [])] });
  }
};
