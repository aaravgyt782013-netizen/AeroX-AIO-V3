import { LavalinkManager } from "lavalink-client";
import fs from "fs-extra";
import path from "node:path";
import { config } from "#config/config";
import { logger } from "#utils/logger";

const SETTINGS_FILE = path.resolve("database/data/music-settings.json");
const DEFAULTS = { defaultVolume: config.music.defaultVolume, maxQueue: config.music.maxQueue, djRoleId: null, announceNowPlaying: true, defaultSource: "ytmsearch", autoplay: false, loop: "off" };

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.settings = {};
    const nodes = [...config.music.nodes, ...config.music.node];
    this.lavalink = nodes.length ? new LavalinkManager({
      nodes,
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
      autoSkip: true,
      client: { id: config.clientId, username: "LightCore" },
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: {
          destroyAfterMs: 60_000,
          autoPlayFunction: async (player, lastPlayedTrack) => {
            if (!this.getSettings(player.guildId).autoplay || !lastPlayedTrack?.info?.title) return;
            const info = lastPlayedTrack.info;
            const query = info.author ? `${info.author} - ${info.title}` : info.title;
            const result = await player.search({ query, source: this.getSettings(player.guildId).defaultSource }, lastPlayedTrack.requester || "LightCore");
            const next = result?.tracks?.find(track => track.info?.identifier !== info.identifier);
            if (next) await player.queue.add(next);
          },
        },
      },
    }) : null;
    if (!this.lavalink) return;
    this.lavalink.on("trackStart", (player, track) => this.announce(player, track).catch(error => logger.warn("Music", "Now-playing announcement failed:", error)));
    this.lavalink.on("trackError", (player, track, payload) => {
      logger.error("Music", `Track failed in guild ${player.guildId}: ${track?.info?.title || "unknown"}`, payload);
      this.sendText(player, `⚠️ I couldn't play **${track?.info?.title || "that track"}**. Try another search or check the music node.`).catch(() => {});
    });
    this.lavalink.on("queueEnd", player => {
      this.sendText(player, "✨ The queue has finished. I'll leave the voice channel in 60 seconds if no more tracks are added.").catch(() => {});
    });
    this.lavalink.nodeManager.on("connect", node => logger.success("MusicNode", `Connected to Lavalink node: ${node.id}`));
    this.lavalink.nodeManager.on("disconnect", (node, reason) => logger.warn("MusicNode", `Node ${node.id} disconnected: ${reason?.reason || reason || "unknown"}`));
    this.lavalink.nodeManager.on("error", (node, error) => logger.error("MusicNode", `Node ${node?.id || "unknown"} error:`, error));
  }

  async init() {
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    try { this.settings = await fs.readJson(SETTINGS_FILE); } catch { this.settings = {}; }
    if (!config.music.enabled) {
      logger.warn("Music", "Music is disabled by MUSIC_ENABLED=false.");
      return;
    }
    if (!this.lavalink) {
      logger.warn("Music", "No Lavalink node configured. Set LAVALINK_HOST/PORT/PASSWORD or LAVALINK_NODES in Render environment variables.");
      return;
    }
    await this.lavalink.init({ id: this.client.user.id, username: this.client.user.username });
    logger.success("Music", `Music manager initialized with ${config.music.nodes.length + config.music.node.length} configured Lavalink node(s).`);
  }

  sendRawData(data) {
    if (!config.music.enabled || !this.lavalink) return;
    try { void this.lavalink.sendRawData(data); } catch (error) { logger.warn("Music", "Failed to forward Discord voice packet:", error); }
  }

  getPlayer(guildId) { return this.lavalink?.getPlayer(guildId); }
  getSettings(guildId) { return { ...DEFAULTS, ...(this.settings[guildId] || {}) }; }

  async updateSettings(guildId, patch) {
    this.settings[guildId] = { ...this.getSettings(guildId), ...patch };
    await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
    return this.getSettings(guildId);
  }

  async announce(player, track) {
    if (!this.getSettings(player.guildId).announceNowPlaying) return;
    const channel = player.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (!channel?.isTextBased()) return;
    const info = track?.info || {};
    const duration = info.isStream ? "LIVE" : this.formatDuration(info.duration);
    await channel.send({ embeds: [{
      color: 0x5865F2,
      title: "🎧 Now Playing",
      description: `[${this.escape(info.title || "Unknown track")}](${info.uri || "https://discord.com"})`,
      fields: [
        { name: "Artist", value: this.escape(info.author || "Unknown"), inline: true },
        { name: "Duration", value: duration, inline: true },
        { name: "Requested by", value: track.requester?.username || track.requester?.tag || "A listener", inline: true },
      ],
      footer: { text: "LightCore Music • Use .music help for controls" },
      thumbnail: info.artworkUrl ? { url: info.artworkUrl } : undefined,
    }] });
  }

  async sendText(player, content) {
    const channel = player?.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (channel?.isTextBased()) return channel.send({ content });
  }

  formatDuration(ms = 0) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  escape(value = "") { return String(value).replace(/[\\*_~`|]/g, "\\$&").slice(0, 180); }
}

