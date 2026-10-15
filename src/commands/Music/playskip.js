import music from "./music.js";

export default {
  name: "playskip",
  aliases: [],
  description: "Play a track immediately after skipping the current one.",
  usage: "playskip <song or URL>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["playskip", ...(context.args || [])] });
  }
};
