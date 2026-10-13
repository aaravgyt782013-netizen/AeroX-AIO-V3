import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "stop",
  aliases: [],
  description: "Stop playback and leave voice.",
  usage: "stop",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["stop", ...(context.args || [])] });
  }
};
