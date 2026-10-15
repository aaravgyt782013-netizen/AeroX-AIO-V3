import music from "./music.js";

export default {
  name: "musicpanel",
  aliases: ["musicdashboard"],
  description: "Open or refresh the shared LightCore music player panel.",
  usage: "musicpanel",
  category: "Music",
  cooldown: 5,
  userPermissions: [],
  permissions: [],
  async execute(context) {
    return music.execute({ ...context, args: ["panel"] });
  }
};
