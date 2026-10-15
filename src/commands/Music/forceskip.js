import music from "./music.js";

export default {
  name: "forceskip",
  aliases: [],
  description: "Skip the current track as a music moderator.",
  usage: "forceskip",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["forceskip", ...(context.args || [])] });
  }
};
