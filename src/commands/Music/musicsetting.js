import { openMusicSettingsPanel } from "./panel.js";

export default {
  name: "musicsetting",
  aliases: ["musicsettings", "musicconfig"],
  description: "Open the interactive server music settings panel.",
  usage: "musicsetting",
  category: "Music",
  cooldown: 5,
  userPermissions: [],
  permissions: [],
  async execute({ client, message }) {
    return openMusicSettingsPanel({ client, message });
  }
};
