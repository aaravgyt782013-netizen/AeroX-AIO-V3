import { LavalinkManager } from "lavalink-client";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.initialized = false;
    this.readyPromise = null;
    this.lastNodeWarning = 0;
    this.history = new Map();
    this.likes = new Map();
    this.init();
  }

  init() {
    this.lavalink = new LavalinkManager({
      nodes: (config.nodes || []).map(node => ({ ...node, retryAmount: Infinity, retryDelay: node.retryDelay || 5000, resumeTimeout: 120000, requestTimeout: 15000 })),
      sendToShard: (guildId, payload) => {
        if (this.client.cluster) return this.client.cluster.broadcastEval((client, ctx) => { const guild = client.guilds.cache.get(ctx.guildId); guild?.shard?.send(ctx.payload); return Boolean(guild); }, { context: { guildId, payload } });
        return this.client.guilds.cache.get(guildId)?.shard?.send(payload);
      },
      autoSkip: true,
      autoSkipOnResolveError: true,
      emitNewSongsOnly: false,
      client: { id: config.clientId || this.client.user?.id, username: this.client.user?.username || "LightCore" },
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        useUnresolvedData: true,
        maxErrorsPerTime: { threshold: 15000, maxAmount: 5 },
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: {
          destroyAfterMs: -1,
          autoPlayFunction: async player => {
            if (!player.get("autoplayEnabled")) return;
            const last = player.queue.previous?.[0] || player.queue.current;
            if (!last?.info?.title) return;
            try {
              const query = [last.info.title, last.info.author].filter(Boolean).join(" ");
              const result = await player.search({ query, source: "ytmsearch" });
              const previousIds = new Set((player.queue.previous || []).slice(0, 8).map(t => t?.info?.identifier).filter(Boolean));
              const next = result?.tracks?.find(t => t?.info?.identifier && !previousIds.has(t.info.identifier));
              if (next) await player.queue.add(next);
            } catch (error) { logger.warn("MusicManager", "Autoplay resolve failed: " + (error?.message || error)); }
          }
        }
      },
      queueOptions: { maxPreviousTracks: 50 },
      linksAllowed: true,
      linksBlacklist: [],
      linksWhitelist: []
    });

    this.lavalink.nodeManager?.on("connect", node => logger.info("MusicManager", "Lavalink connected: " + (node?.id || "unknown")));
    this.lavalink.nodeManager?.on("reconnecting", node => logger.warn("MusicManager", "Lavalink reconnecting: " + (node?.id || "unknown")));
    this.lavalink.nodeManager?.on("disconnect", (node, reason) => logger.warn("MusicManager", "Lavalink disconnected: " + (node?.id || "unknown") + " — " + (reason?.message || reason || "unknown")));
    this.lavalink.nodeManager?.on("error", (node, error) => logger.error("MusicManager", "Lavalink node error [" + (node?.id || "unknown") + "]", error));
    this.lavalink.on("trackStart", (player, track) => {
      if (!track?.info?.title) return;
      const list = this.history.get(player.guildId) || [];
      list.unshift({ title:track.info.title, author:track.info.author || "Unknown", uri:track.info.uri || null, requester:track.requester?.id || track.info?.userData?.requesterId || null, at:Date.now() });
      this.history.set(player.guildId, list.slice(0, 50));
      const channel = this.client.channels.cache.get(player.textChannelId);
      let announce = true;
      try { announce = db.guild.getMusicSettings(player.guildId).announceSongs; } catch {}
      if (announce && channel) channel.send({ content:"🎶 **Now Playing:** " + track.info.title }).catch(() => {});
    });
    this.lavalink.on("trackError", (player, track, payload) => logger.error("MusicManager", "Track error in " + (player?.guildId || "unknown") + ": " + (payload?.exception?.message || payload?.message || "unknown")));
    this.lavalink.on("trackStuck", (player, track, payload) => logger.warn("MusicManager", "Track stuck in " + (player?.guildId || "unknown") + " after " + (payload?.thresholdMs || "?") + "ms"));
    this.lavalink.on("playerSocketClosed", (player, payload) => logger.warn("MusicManager", "Player voice socket closed for " + (player?.guildId || "unknown") + ": " + (payload?.reason || payload?.code || "unknown")));

    this.readyPromise = new Promise(resolve => {
      const onReady = async () => {
        try { await this.lavalink.init({ id: this.client.user.id, username: this.client.user.username }); logger.info("MusicManager", "Lavalink manager initialized."); }
        catch (error) { logger.error("MusicManager", "Lavalink initialization failed", error); }
        finally { this.initialized = true; resolve(); }
      };
      if (this.client.isReady?.()) onReady(); else this.client.once("ready", onReady);
    });
  }

  getUsableNodes() { try { return this.lavalink?.nodeManager?.leastUsedNodes("players") || []; } catch { return []; } }

  async waitForNode(timeout = 15000) {
    if (!this.initialized && this.readyPromise) await Promise.race([this.readyPromise, sleep(timeout)]);
    const start = Date.now();
    while (Date.now() - start < timeout) { const nodes = this.getUsableNodes(); if (nodes.length) return nodes; await sleep(500); }
    if (Date.now() - this.lastNodeWarning > 30000) { this.lastNodeWarning = Date.now(); logger.warn("MusicManager", "No Lavalink v4 node is currently connected."); }
    return [];
  }

  isUrl(value) { try { new URL(String(value)); return true; } catch { return false; } }

  normalizeSource(source = "ytmsearch") {
    const map = { yt:"ytsearch", youtube:"ytsearch", ytm:"ytmsearch", youtubemusic:"ytmsearch", sp:"spsearch", spotify:"spsearch", sc:"scsearch", soundcloud:"scsearch" };
    return map[String(source).toLowerCase()] || source;
  }

  async createPlayer({ guildId, textChannelId, voiceChannelId }) {
    if (!guildId || !textChannelId || !voiceChannelId) return null;
    const existing = this.lavalink?.getPlayer(guildId);
    if (existing) { if (existing.voiceChannelId !== voiceChannelId) await existing.connect().catch(() => {}); return existing; }
    const nodes = await this.waitForNode();
    if (!nodes.length) return null;
    let volume = 100, autoplay = false;
    try { volume = Number(db.guild.getDefaultVolume(guildId)) || 100; autoplay = !!db.guild.getMusicSettings(guildId).autoplay; } catch {}
    volume = Math.max(1, Math.min(100, volume));
    try {
      const player = await this.lavalink.createPlayer({ guildId, voiceChannelId, textChannelId, selfDeaf:true, selfMute:false, volume });
      if (!player) return null;
      player.set("autoplayEnabled", autoplay);
      if (!player.connected) await player.connect();
      return player;
    } catch (error) { logger.error("MusicManager", "Player creation failed: " + (error?.message || error)); return null; }
  }

  async search(query, { source = "ytmsearch", requester } = {}) {
    const nodes = await this.waitForNode();
    if (!nodes.length) return null;
    const src = this.normalizeSource(source);
    for (const node of nodes) {
      try {
        const result = await node.search({ query, source: src }, requester);
        if (result?.tracks?.length || result?.loadType === "playlist") return result;
      } catch (error) { logger.debug("MusicManager", "Search failed on " + node.id + ": " + (error?.message || error)); }
    }
    return null;
  }

  async resolve(query, { source = "ytmsearch", requester } = {}) { return this.search(query, { source, requester }); }
  getPlayer(guildId) { return this.lavalink?.getPlayer(guildId) || null; }
  getDefaultVolume(guildId) { try { return db.guild.getDefaultVolume(guildId) || 100; } catch { return 100; } }
  setDefaultVolume(guildId, volume) { try { db.guild.setDefaultVolume(guildId, Math.max(1, Math.min(100, Number(volume)))); return true; } catch { return false; } }
  async is247ModeEnabled(guildId) { try { return db.guild.get247Settings(guildId).enabled === true; } catch { return false; } }
}\n  getHistory(guildId) { return this.history.get(guildId) || []; }\n  toggleLike(userId, track) {\n    if (!userId || !track?.info?.identifier) return false;\n    const list = this.likes.get(userId) || [];\n    const index = list.findIndex(x => x.identifier === track.info.identifier);\n    if (index >= 0) { list.splice(index, 1); this.likes.set(userId, list); return false; }\n    list.unshift({ identifier:track.info.identifier, title:track.info.title, author:track.info.author || "Unknown", uri:track.info.uri || null });\n    this.likes.set(userId, list.slice(0, 100));\n    return true;\n  }\n  getLikes(userId) { return this.likes.get(userId) || []; }\n