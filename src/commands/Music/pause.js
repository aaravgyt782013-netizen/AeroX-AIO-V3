import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "pause",
  aliases: [],
  description: "Pause the current track.",
  usage: "pause",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["pause", ...(context.args || [])] });
  }
};
