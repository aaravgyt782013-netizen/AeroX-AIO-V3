import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "seek",
  aliases: [],
  description: "Seek within the current track by seconds.",
  usage: "seek <seconds>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["seek", ...(context.args || [])] });
  }
};
