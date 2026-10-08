import { command, context, safeReply } from "#utils/RythmCommands";

const run = async x => {
  const c = context(x);
  const g = c.guild;
  if (!g) return safeReply(x, "♾️ 24/7", "Server only.", 0xED4245);

  const current = x.client.db.guild.get247Settings(g.id);
  const enable = !current.enabled;

  if (enable) {
    const v = c.member?.voice?.channel;
    if (!v) return safeReply(x, "♾️ 24/7", "Join a voice channel first.", 0xED4245);
    x.client.db.guild.set247Mode(g.id, true, v.id, c.channel.id);
    x.client.db.guild.setMusicSettings(g.id, { mode247: true });
  } else {
    x.client.db.guild.set247Mode(g.id, false);
    x.client.db.guild.setMusicSettings(g.id, { mode247: false });
  }

  const player = x.client.music?.getPlayer?.(g.id);
  if (player) {
    player.set("stayAlive", enable || Boolean(x.client.db.guild.getMusicSettings(g.id).autoplay));
    x.client.music?.refreshVoiceStayAlive?.(g.id, true);
  }

  return safeReply(x, "♾️ 24/7", enable
    ? "24/7 mode enabled. LightCore will remain in the configured voice channel until you disable it."
    : "24/7 mode disabled.");
};

export default command({
  name: "247",
  description: "Keep LightCore connected to voice 24/7",
  aliases: ["alwaysplaying"],
  execute: run,
  slashExecute: run
});
