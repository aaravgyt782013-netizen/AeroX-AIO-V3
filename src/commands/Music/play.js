import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "play",
  aliases: ["p"],
  description: "Play a track or playlist from a URL or search query.",
  usage: "play <song or URL>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["play", ...(context.args || [])] });
  }
};
