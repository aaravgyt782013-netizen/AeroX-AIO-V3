import music from "./music.js";

export default {
  name: "skipto",
  aliases: [],
  description: "Skip ahead to a queue position.",
  usage: "skipto <position>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["skipto", ...(context.args || [])] });
  }
};
