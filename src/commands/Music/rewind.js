import music from "./music.js";

export default {
  name: "rewind",
  aliases: [],
  description: "Rewind the current track by 10 seconds.",
  usage: "rewind",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["rewind", ...(context.args || [])] });
  }
};
