import music from "./music.js";

export default {
  name: "playtop",
  aliases: [],
  description: "Place a track at the front of the queue.",
  usage: "playtop <song or URL>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["playtop", ...(context.args || [])] });
  }
};
