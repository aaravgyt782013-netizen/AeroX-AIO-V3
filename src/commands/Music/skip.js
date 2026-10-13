import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "skip",
  aliases: [],
  description: "Skip the current track.",
  usage: "skip",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["skip", ...(context.args || [])] });
  }
};
