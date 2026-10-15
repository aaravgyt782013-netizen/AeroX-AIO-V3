import music from "./music.js";

export default {
  name: "removedupes",
  aliases: [],
  description: "Remove duplicate upcoming tracks.",
  usage: "removedupes",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["removedupes", ...(context.args || [])] });
  }
};
