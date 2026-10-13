import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "clear",
  aliases: [],
  description: "Clear the upcoming queue.",
  usage: "clear",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["clear", ...(context.args || [])] });
  }
};
