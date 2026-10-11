import {
  command, context, musicSettings, safeReply, reply, settingsContainer, v2Payload
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
    if (key === "247") {
      let existing = c.client.music?.getPlayer?.(guild);
      const before = c.client.db.guild.getMusicSettings(guild);
      const voiceId = before.musicVoiceChannel || existing?.voiceChannelId || c.member?.voice?.channelId || null;
      if (enabled && !voiceId) return safeReply(x, "⚙️ Settings", "Join a voice channel or configure the Music Voice Channel before enabling 24/7.", 0xED4245);
      if (enabled && !existing && voiceId) {
        existing = await c.client.music?.createPlayer?.({
          guildId: guild,
          voiceChannelId: voiceId,
          textChannelId: before.requestChannel || c.channel.id
        });
        if (!existing) return safeReply(x, "⚙️ Settings", "I couldn't connect to the configured voice channel. Check Lavalink and my voice permissions.", 0xED4245);
      }
      c.client.db.guild.setMusicSettings(guild, { mode247: enabled });
      if (enabled) c.client.db.guild.set247Mode(guild, true, voiceId, before.requestChannel || existing?.textChannelId || c.channel.id);
      else c.client.db.guild.set247Mode(guild, false);
      if (existing) {
        existing.set("stay247", enabled);
        existing.set("stayAlive", enabled || Boolean(c.client.db.guild.getMusicSettings(guild).autoplay));
        c.client.music?.refreshVoiceStayAlive?.(guild, true);
      }
    }
    let player = c.client.music?.getPlayer?.(guild);
    const saved = c.client.db.guild.getMusicSettings(guild);
    if (key === "autoplay") {
      const voice = saved.musicVoiceChannel ? c.guild.channels.cache.get(saved.musicVoiceChannel) : c.member?.voice?.channel;
      if (enabled && !player && !voice) return safeReply(x, "⚙️ Settings", "Join a voice channel or configure the Music Voice Channel before enabling autoplay.", 0xED4245);
      if (enabled && !player && voice) {
        player = await c.client.music?.createPlayer?.({
          guildId: guild,
          voiceChannelId: voice.id,
          textChannelId: saved.requestChannel || c.channel.id
        });
        if (!player) return safeReply(x, "⚙️ Settings", "I couldn't connect to the configured voice channel. Check Lavalink and my voice permissions.", 0xED4245);
      }
      if (enabled && player) c.client.db.guild.setAutoplayVoiceSession(guild, true, player.voiceChannelId, saved.requestChannel || player.textChannelId);
      else if (!enabled) c.client.db.guild.setAutoplayVoiceSession(guild, false);
    }
    if (player) {
      player.set("autoplayEnabled", Boolean(saved.autoplay));
      player.set("stay247", Boolean(saved.mode247));
      player.set("stayAlive", Boolean(saved.autoplay || saved.mode247));
    }
    if (key === "autoplay") c.client.music?.refreshVoiceStayAlive?.(guild, true);
    return render(x, key + " " + (enabled ? "enabled" : "disabled"));
  }

  if (key === "source") {
    const allowed = ["ytmsearch","ytsearch","scsearch"];
    if (!allowed.includes(value)) return safeReply(x, "⚙️ Settings", "Playback sources: ytmsearch, ytsearch, scsearch. Use .spotify for Spotify catalog search and links.", 0xED4245);
    c.client.db.guild.setMusicSettings(guild, { source: value });
    return render(x, "Source changed to " + value);
  }
  return safeReply(x, "⚙️ Settings", "Unknown setting. Use .settings <setting> <value>.", 0xED4245);
};

export default command({
  name: "settings", description: "Open the interactive LightCore music settings panel", aliases: ["setting", "musicsettings"], slash: false,
  options: [
    { name: "setting", description: "Setting name", type: 3, required: false },
    { name: "value", description: "on/off or source", type: 3, required: false }
  ],
  execute: run
});
