import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "remove",
  aliases: [],
  description: "Remove a queued track by position.",
  usage: "remove <position>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["remove", ...(context.args || [])] });
  }
};
