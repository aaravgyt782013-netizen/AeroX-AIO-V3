import { PermissionFlagsBits } from "discord.js";
import music from "./music.js";

export default {
  name: "back",
  aliases: [],
  description: "Return to the previous track when available.",
  usage: "back",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["back", ...(context.args || [])] });
  }
};
