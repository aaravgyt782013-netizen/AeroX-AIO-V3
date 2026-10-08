import { command, musicSettings, safeReply } from "#utils/RythmCommands";

const run = async x => {
  const guild = x.interaction?.guild || x.message?.guild;
  if (!guild) return safeReply(x, "🔄 Autoplay", "Server only.", 0xED4245);

  const next = !musicSettings(x).autoplay;
  x.client.db.guild.setAutoplay(guild.id, next);

  const player = x.client.music?.getPlayer?.(guild.id);
  if (player) {
    player.set("autoplayEnabled", next);
    player.set("stayAlive", next || Boolean(x.client.db.guild.getMusicSettings(guild.id).mode247));
    x.client.music?.refreshVoiceStayAlive?.(guild.id, true);
  }

  return safeReply(
    x,
    "🔄 Autoplay",
    next
      ? "Autoplay enabled. LightCore will keep the music player connected even when you are alone and will continue finding songs."
      : "Autoplay disabled."
  );
};

export default command({
  name: "autoplay",
  description: "Toggle autoplay",
  execute: run,
  slashExecute: run
});
