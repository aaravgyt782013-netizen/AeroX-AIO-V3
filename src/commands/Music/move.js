import music from "./music.js";

export default {
  name: "move",
  aliases: [],
  description: "Move a track to another queue position.",
  usage: "move <from> <to>",
  category: "Music",
  cooldown: 2,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["move", ...(context.args || [])] });
  }
};
