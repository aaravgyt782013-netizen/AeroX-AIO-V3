import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "search",
  aliases: [],
  description: "Search tracks and select the result to play.",
  usage: "search <song or URL>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["search", ...(context.args || [])] });
  }
};
