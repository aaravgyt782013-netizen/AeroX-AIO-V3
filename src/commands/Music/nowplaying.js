import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "nowplaying",
  aliases: ["np"],
  description: "Show the interactive now-playing player.",
  usage: "nowplaying",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
  async execute(context) {
    return music.execute({ ...context, args: ["nowplaying", ...(context.args || [])] });
  }
};
