import music from "./music.js";

export default {
  name: "replay",
  aliases: [],
  description: "Restart the current track.",
  usage: "replay",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["replay", ...(context.args || [])] });
  }
};
