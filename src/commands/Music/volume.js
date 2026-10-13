import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "volume",
  aliases: ["vol"],
  description: "Set player volume from 0 to 100.",
  usage: "volume <0-100>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["volume", ...(context.args || [])] });
  }
};
