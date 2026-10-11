import { command, musicSettings, safeReply } from "#utils/RythmCommands";

const run = async x => {
  const guild = x.interaction?.guild || x.message?.guild;
  if (!guild) return safeReply(x, "🔄 Autoplay", "Server only.", 0xED4245);

  const next = !musicSettings(x).autoplay;
  x.client.db.guild.setAutoplay(guild.id, next);

  let player = x.client.music?.getPlayer?.(guild.id);
  const member = x.interaction?.member || x.message?.member;
  const settings = x.client.db.guild.getMusicSettings(guild.id);
  if (next && !player && member?.voice?.channelId) {
    player = await x.client.music?.createPlayer?.({
      guildId: guild.id,
      voiceChannelId: member.voice.channelId,
      textChannelId: settings.requestChannel || (x.interaction?.channelId || x.message?.channelId)
    });
  }
  if (next && player) {
    x.client.db.guild.setAutoplayVoiceSession(guild.id, true, player.voiceChannelId, settings.requestChannel || player.textChannelId);
  } else if (!next) {
    x.client.db.guild.setAutoplayVoiceSession(guild.id, false);
  }
  if (player) {
    player.set("autoplayEnabled", next);
    player.set("stayAlive", next || Boolean(settings.mode247));
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
  slash: false
});
