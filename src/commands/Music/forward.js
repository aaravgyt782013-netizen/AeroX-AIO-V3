import music from "./music.js";

export default {
  name: "forward",
  aliases: [],
  description: "Forward the current track by 10 seconds.",
  usage: "forward",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["forward", ...(context.args || [])] });
  }
};
