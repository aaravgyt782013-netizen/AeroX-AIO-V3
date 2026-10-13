import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "resume",
  aliases: [],
  description: "Resume paused playback.",
  usage: "resume",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["resume", ...(context.args || [])] });
  }
};
