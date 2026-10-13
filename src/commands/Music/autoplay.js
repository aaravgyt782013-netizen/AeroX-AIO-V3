import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "autoplay",
  aliases: [],
  description: "Toggle server autoplay.",
  usage: "autoplay <on|off>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["autoplay", ...(context.args || [])] });
  }
};
