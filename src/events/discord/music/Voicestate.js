import { PlayerManager } from "#managers/PlayerManager";
import { logger } from "#utils/logger";

const aloneTimeouts = new Map();
const reconnectTimers = new Map();

export default {
  name: "voiceStateUpdate",
  once: false,
  async execute(oldState, newState, client) {
    try {
      const guildId = newState.guild.id;
      const raw = client.music?.getPlayer(guildId);
      if (!raw) return;

      const pm = new PlayerManager(raw);
      const botMember = newState.guild.members.me;

      if (newState.id === client.user.id) {
        await handleBotState(oldState, newState, pm, client);
        return;
      }

      await handleUserState(oldState, newState, pm, botMember, client);
    } catch (error) {
      logger.error("VoiceStateUpdate", "Music voice-state handler failed:", error);
    }
  }
};

function stayAliveEnabled(pm, client) {
  try {
    const s = client.db?.guild?.getMusicSettings?.(pm.guildId);
    return Boolean(pm.getData("stayAlive") || pm.getData("autoplayEnabled") || s?.autoplay || s?.mode247);
  } catch {
    return Boolean(pm.getData("stayAlive") || pm.getData("autoplayEnabled"));
  }
}

async function handleBotState(oldState, newState, pm, client) {
  const guildId = newState.guild.id;

  if (oldState.channelId && !newState.channelId) {
    if (stayAliveEnabled(pm, client)) {
      logger.warn("VoiceStateUpdate", "LightCore lost voice in guild " + guildId + "; reconnecting.");
      scheduleReconnect(pm, oldState.channelId, client);
      return;
    }
    clearAloneTimeout(guildId);
    await pm.destroy("Bot disconnected from voice channel", true).catch(() => {});
    return;
  }

  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId && stayAliveEnabled(pm, client)) {
    await pm.changeVoiceState({ channelId: newState.channelId }).catch(() => {});
  }
}

function scheduleReconnect(pm, channelId, client) {
  const guildId = pm.guildId;
  if (reconnectTimers.has(guildId)) return;

  reconnectTimers.set(guildId, setTimeout(async () => {
    reconnectTimers.delete(guildId);
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild?.channels?.cache?.get(channelId)) return;
      const current = client.music?.getPlayer(guildId);
      if (!current || !stayAliveEnabled(new PlayerManager(current), client)) return;

      const manager = new PlayerManager(current);
      await manager.changeVoiceState({ channelId });
      await manager.connect().catch(() => {});
      logger.success("VoiceStateUpdate", "LightCore reconnected to voice in guild " + guildId);
    } catch (error) {
      logger.warn("VoiceStateUpdate", "Voice reconnect failed: " + (error?.message || error));
      scheduleReconnect(pm, channelId, client);
    }
  }, 5000));
}

async function handleUserState(oldState, newState, pm, botMember, client) {
  const guildId = newState.guild.id;
  const botChannelId = botMember?.voice?.channelId;
  if (!botChannelId) return;

  if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
    const channel = newState.guild.channels.cache.get(botChannelId);
    const humans = channel?.members?.filter(member => !member.user.bot).size ?? 0;

    if (humans === 0 && stayAliveEnabled(pm, client)) {
      clearAloneTimeout(guildId);
      pm.setData("stayAlive", true);
      return;
    }

    if (humans === 0) {
      if (pm.isPlaying) {
        await pm.pause().catch(() => {});
        pm.setData("pausedDueToAlone", true);
      }
      clearAloneTimeout(guildId);
      aloneTimeouts.set(guildId, setTimeout(async () => {
        aloneTimeouts.delete(guildId);
        const current = client.music?.getPlayer(guildId);
        if (!current) return;
        const latest = new PlayerManager(current);
        const latestChannel = newState.guild.members.me?.voice?.channel;
        if ((latestChannel?.members?.filter(member => !member.user.bot).size ?? 0) === 0 && !stayAliveEnabled(latest, client)) {
          await latest.destroy("Voice channel empty for 60 seconds", true).catch(() => {});
        }
      }, 60000));
    } else {
      clearAloneTimeout(guildId);
      if (pm.isPaused && pm.getData("pausedDueToAlone")) {
        await pm.resume().catch(() => {});
        pm.setData("pausedDueToAlone", false);
      }
    }
  }

  if (oldState.channelId !== botChannelId && newState.channelId === botChannelId) {
    clearAloneTimeout(guildId);
    if (pm.isPaused && pm.getData("pausedDueToAlone")) {
      await pm.resume().catch(() => {});
      pm.setData("pausedDueToAlone", false);
    }
  }
}

function clearAloneTimeout(guildId) {
  const timer = aloneTimeouts.get(guildId);
  if (timer) clearTimeout(timer);
  aloneTimeouts.delete(guildId);
}
