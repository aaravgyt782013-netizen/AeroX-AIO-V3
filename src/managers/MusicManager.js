import { LavalinkManager } from "lavalink-client";
import fs from "fs-extra";
import path from "node:path";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { loadNeonJsonSnapshot, saveNeonJsonSnapshot } from "#database/neon/snapshots";

const SETTINGS_FILE = path.resolve("database/data/music-settings.json");
const DEFAULTS = {
  defaultVolume: config.music.defaultVolume,
  maxQueue: config.music.maxQueue,
  djRoleId: null,
  announceNowPlaying: true,
  defaultSource: "ytmsearch",
  autoplay: false,
  loop: "off"
};

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.settings = {};
    this.initialized = false;
    this.nodesConfig = [...(config.music.nodes || []), ...(config.music.node || [])];
    this.lavalink = this.nodesConfig.length ? new LavalinkManager({
      nodes: this.nodesConfig,
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
      autoSkip: true,
      client: { id: config.clientId, username: "AeroX" },
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: {
          destroyAfterMs: 60000,
          autoPlayFunction: async (player, lastPlayedTrack) => {
            const settings = this.getSettings(player.guildId);
            if (!settings.autoplay || !lastPlayedTrack?.info?.title) return;
            const info = lastPlayedTrack.info;
            const query = info.author ? info.author + " - " + info.title : info.title;
            const result = await player.search({ query, source: settings.defaultSource }, lastPlayedTrack.requester || "AeroX");
            const next = result?.tracks?.find(track => track.info?.identifier !== info.identifier);
            if (next) await player.queue.add(next);
          }
        }
      }
    }) : null;

    if (!this.lavalink) {
      logger.warn("Music", "No Lavalink node configured. Set LAVALINK_HOST/PORT/PASSWORD or LAVALINK_NODES.");
      return;
    }

    this.lavalink.on("trackStart", (player, track) => {
      this.announce(player, track).catch(error => logger.warn("Music", "Now-playing announcement failed:", error));
    });
    this.lavalink.on("trackEnd", (player, track) => {
      if (track) {
        try {
          player.set("previousTrack", track);
          player.set("lastPlayedTrack", track);
        } catch {}
      }
    });
    this.lavalink.on("trackError", (player, track, payload) => {
      logger.error("Music", "Track failed in guild " + player.guildId + ": " + (track?.info?.title || "unknown"), payload);
      this.sendText(player, "⚠️ I couldn't play **" + this.escape(track?.info?.title || "that track") + "**. Try another result or check the Lavalink node and its source plugins.")
        .catch(() => {});
    });
    this.lavalink.on("queueEnd", player => {
      this.sendText(player, "✨ The queue has finished. I'll leave the voice channel in 60 seconds if no more tracks are added.")
        .catch(() => {});
    });
    this.lavalink.nodeManager.on("connect", node => logger.success("MusicNode", "Connected to Lavalink node: " + node.id));
    this.lavalink.nodeManager.on("disconnect", (node, reason) => logger.warn("MusicNode", "Node " + node.id + " disconnected: " + (reason?.reason || reason || "unknown")));
    this.lavalink.nodeManager.on("error", (node, error) => logger.error("MusicNode", "Node " + (node?.id || "unknown") + " error:", error));
  }

  async init() {
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    let localSettings = {};
    try { localSettings = await fs.readJson(SETTINGS_FILE); } catch {}
    const storedSettings = await loadNeonJsonSnapshot("music-settings", null);
    this.settings = storedSettings && typeof storedSettings === "object" && !Array.isArray(storedSettings)
      ? storedSettings
      : localSettings;
    if (!storedSettings) await saveNeonJsonSnapshot("music-settings", this.settings);
    await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });

    if (!config.music.enabled) {
      logger.warn("Music", "Music is disabled by MUSIC_ENABLED=false.");
      return;
    }
    if (!this.lavalink) {
      logger.warn("Music", "Music cannot start: no Lavalink node is configured.");
      return;
    }

    await this.lavalink.init({ id: this.client.user.id, username: this.client.user.username });
    this.initialized = true;
    logger.success("Music", "Music manager initialized with " + this.nodesConfig.length + " configured Lavalink node(s).");
  }

  sendRawData(data) {
    if (!config.music.enabled || !this.lavalink) return;
    try { void this.lavalink.sendRawData(data); }
    catch (error) { logger.warn("Music", "Failed to forward Discord voice packet:", error); }
  }

  getPlayer(guildId) { return this.lavalink?.getPlayer(guildId) || null; }

  getSettings(guildId) {
    return { ...DEFAULTS, ...(this.settings[guildId] || {}) };
  }

  async updateSettings(guildId, patch) {
    if (!guildId) throw new Error("A guild ID is required to save music settings.");
    const nextSettings = {
      ...this.settings,
      [guildId]: { ...this.getSettings(guildId), ...patch }
    };
    // Neon is authoritative. Do not update memory/local mirror if the durable write fails.
    await saveNeonJsonSnapshot("music-settings", nextSettings);
    this.settings = nextSettings;
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
    return this.getSettings(guildId);
  }

  async announce(player, track) {
    if (!this.getSettings(player.guildId).announceNowPlaying) return;
    const channel = player.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (!channel?.isTextBased()) return;
    const info = track?.info || {};
    const duration = info.isStream ? "LIVE" : this.formatDuration(info.duration);
    const url = /^https?:\/\//i.test(info.uri || "") ? info.uri : "https://discord.com";
    await channel.send({
      embeds: [{
        color: 0x5865F2,
        title: "🎧 Now Playing",
        description: "[" + this.escape(info.title || "Unknown track") + "](" + url + ")",
        fields: [
          { name: "Artist", value: this.escape(info.author || "Unknown"), inline: true },
          { name: "Duration", value: duration, inline: true },
          { name: "Requested by", value: this.escape(track.requester?.username || track.requester?.tag || "A listener"), inline: true }
        ],
        footer: { text: "AeroX Music • Use .nowplaying for interactive controls" },
        thumbnail: info.artworkUrl ? { url: info.artworkUrl } : undefined
      }]
    });
  }

  async sendText(player, content) {
    const channel = player?.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (channel?.isTextBased()) return channel.send({ content });
  }

  formatDuration(ms = 0) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") : minutes + ":" + String(seconds).padStart(2, "0");
  }

  escape(value = "") {
    return String(value).replace(/[\\*_~]/g, "").replace(/[\r\n]/g, " ").slice(0, 180);
  }
}
