import music from "./music.js";

export default {
  name: "queueloop",
  aliases: [],
  description: "Toggle queue repeat mode.",
  usage: "queueloop",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["queueloop", ...(context.args || [])] });
  }
};
