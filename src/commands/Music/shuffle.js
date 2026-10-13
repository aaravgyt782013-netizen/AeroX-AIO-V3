import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "shuffle",
  aliases: [],
  description: "Shuffle upcoming tracks.",
  usage: "shuffle",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["shuffle", ...(context.args || [])] });
  }
};
