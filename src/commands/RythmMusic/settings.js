import {
  command,
  context,
  musicSettings,
  safeReply,
  reply,
  settingsContainer,
  v2Payload
} from "#utils/RythmCommands";

function bool(value) {
  const v = String(value ?? "").toLowerCase();
  if (["on","true","yes","enable","enabled"].includes(v)) return true;
  if (["off","false","no","disable","disabled"].includes(v)) return false;
  return null;
}

const render = (x, notice = "") => reply(x, v2Payload(settingsContainer(musicSettings(x), notice)));

const run = async x => {
  const c = context(x);
  if (!c.guild) return safeReply(x, "⚙️ Music Settings", "Server only.", 0xED4245);

  const args = c.args || [];
  const sub = x.interaction?.options?.getString("setting") || args[0];
  const value = x.interaction?.options?.getString("value") || args[1];
  if (!sub) return render(x);

  if (!c.member?.permissions?.has("ManageGuild") && !c.member?.permissions?.has("Administrator")) {
    return safeReply(x, "⚙️ Settings", "You need Manage Server to change music settings.", 0xED4245);
  }

  const key = String(sub).toLowerCase();
  const guild = c.guild.id;

  if (["autoplay","announce","announcesongs","voteskip","247"].includes(key)) {
    const enabled = bool(value);
    if (enabled === null) return safeReply(x, "⚙️ Settings", "Use on or off.", 0xED4245);
    if (key === "autoplay") c.client.db.guild.setAutoplay(guild, enabled);
    if (key === "announce" || key === "announcesongs") c.client.db.guild.setAnnounceSongs(guild, enabled);
    if (key === "voteskip") c.client.db.guild.setVoteSkip(guild, enabled);
    if (key === "247") c.client.db.guild.setMusicSettings(guild, { mode247: enabled });
    const player = c.client.music?.getPlayer?.(guild);
    if (player) player.set("autoplayEnabled", enabled);
    return render(x, `${key} ${enabled ? "enabled" : "disabled"}`);
  }

  if (key === "source") {
    const allowed = ["ytmsearch","ytsearch","spsearch","scsearch"];
    if (!allowed.includes(value)) return safeReply(x, "⚙️ Settings", "Sources: ytmsearch, ytsearch, spsearch, scsearch.", 0xED4245);
    c.client.db.guild.setMusicSettings(guild, { source: value });
    return render(x, `Source changed to ${value}`);
  }

  return safeReply(x, "⚙️ Settings", "Unknown setting. Use the settings panel or .settings <setting> <value>.", 0xED4245);
};

export default command({
  name: "settings",
  description: "Configure LightCore music settings",
  aliases: ["setting"],
  options: [
    { name: "setting", description: "Setting name", type: 3, required: false },
    { name: "value", description: "on/off or source", type: 3, required: false }
  ],
  execute: run,
  slashExecute: run
});
