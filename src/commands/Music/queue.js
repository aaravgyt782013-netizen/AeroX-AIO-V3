import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "queue",
  aliases: ["q"],
  description: "Show the current track and upcoming queue.",
  usage: "queue",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["queue", ...(context.args || [])] });
  }
};
