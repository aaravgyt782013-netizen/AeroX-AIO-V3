import { LavalinkManager } from "lavalink-client";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = (promise, ms, message) => Promise.race([
  promise,
  sleep(ms).then(() => { throw new Error(message); })
]);

export class MusicEngine {
  constructor(client) {
    this.client = client;
    this.history = new Map();
    this.likes = new Map();
    this.emptyTimers = new Map();
    this.ready = false;
    this.lastUnavailable = 0;

    this.lavalink = new LavalinkManager({
      nodes: (config.nodes || []).map(node => ({
        ...node,
        retryAmount: 4,
        retryDelay: 15000,
        resumeTimeout: 300000,
        requestTimeout: 8000
      })),
      sendToShard: (guildId, payload) => {
        if (this.client.cluster) {
          return this.client.cluster.broadcastEval(
            (client, ctx) => {
              const guild = client.guilds.cache.get(ctx.guildId);
              guild?.shard?.send(ctx.payload);
              return Boolean(guild);
            },
            { context: { guildId, payload } }
          );
        }
        return this.client.guilds.cache.get(guildId)?.shard?.send(payload);
      },
      autoSkip: true,
      autoSkipOnResolveError: true,
      emitNewSongsOnly: false,
      client: {
        id: config.clientId || client.user?.id,
        username: client.user?.username || "LightCore"
      },
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        useUnresolvedData: true,
        maxErrorsPerTime: { threshold: 15000, maxAmount: 5 },
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: { destroyAfterMs: -1, minAutoPlayMs: 3000 }
      },
      queueOptions: { maxPreviousTracks: 50 },
      linksAllowed: true
    });

    this._bindEvents();
    this.readyPromise = this._start();
  }

  async _start() {
    const start = async () => {
      try {
        await this.lavalink.init({ id: this.client.user.id, username: this.client.user.username });
        this.ready = true;
        logger.success("MusicEngine", "LightCore music engine initialized.");
      } catch (error) {
        this.ready = true;
        logger.error("MusicEngine", "Music engine initialization failed", error);
      }
    };
    if (this.client.isReady?.()) await start();
    else await new Promise(resolve => this.client.once("ready", async () => { await start(); resolve(); }));
  }

  _bindEvents() {
    this.lavalink.nodeManager?.on("connect", node => {
      try { node.updateSession?.(true, 300000); } catch {}
      logger.success("MusicEngine", "Lavalink connected: " + node.id);
    });
    this.lavalink.nodeManager?.on("reconnecting", node => {
      logger.warn("MusicEngine", "Lavalink reconnecting: " + node.id);
    });
    this.lavalink.nodeManager?.on("disconnect", (node, reason) => {
      logger.warn("MusicEngine", "Lavalink disconnected [" + node.id + "]: " + (reason?.message || reason || "unknown"));
    });
    this.lavalink.nodeManager?.on("error", (node, error) => {
      logger.warn("MusicEngine", "Lavalink node error [" + node.id + "]: " + (error?.message || error || "unknown"));
    });
    this.lavalink.nodeManager?.on("resumed", (node, payload, players) => {
      logger.info("MusicEngine", "Session resumed on " + node.id + " (" + (players?.length || 0) + " players)");
    });

    this.lavalink.on("trackStart", (player, track) => {
      if (!track?.info?.title) return;
      const list = this.history.get(player.guildId) || [];
      list.unshift({
        title: track.info.title,
        author: track.info.author || "Unknown",
        uri: track.info.uri || null,
        requester: track.requester?.id || null,
        at: Date.now()
      });
      this.history.set(player.guildId, list.slice(0, 50));
      player.set("lastPlayedTrack", track);
      this.refreshVoiceStayAlive(player.guildId, true);
    });

    this.lavalink.on("trackEnd", player => this.refreshVoiceStayAlive(player.guildId));
    this.lavalink.on("trackError", (player, track, payload) => {
      logger.error("MusicEngine", "Track error [" + player?.guildId + "]: " + (payload?.exception?.message || payload?.message || "unknown"));
    });
    this.lavalink.on("trackStuck", (player, track, payload) => {
      logger.warn("MusicEngine", "Track stuck [" + player?.guildId + "] after " + (payload?.thresholdMs || "?") + "ms");
    });
    this.lavalink.on("playerVoiceJoin", player => this.refreshVoiceStayAlive(player.guildId, true));
    this.lavalink.on("playerVoiceLeave", player => this.refreshVoiceStayAlive(player.guildId, false));
    this.lavalink.on("queueEnd", player => this._queueEnd(player));
  }

  nodes() {
    try {
      return (this.lavalink.nodeManager.leastUsedNodes("players") || []).filter(node => node?.connected === true);
    } catch {
      return [];
    }
  }

  async waitForNode(ms = 12000) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const nodes = this.nodes();
      if (nodes.length) return nodes;
      await sleep(400);
    }
    if (Date.now() - this.lastUnavailable > 30000) {
      this.lastUnavailable = Date.now();
      logger.warn("MusicEngine", "No connected Lavalink v4 node is available.");
    }
    return [];
  }

  isUrl(value) {
    try { new URL(String(value)); return true; } catch { return false; }
  }

  normalizeSource(source = "ytmsearch") {
    const map = {
      yt: "ytsearch",
      youtube: "ytsearch",
      ytm: "ytmsearch",
      youtubemusic: "ytmsearch",
      sp: "spsearch",
      spotify: "spsearch",
      sc: "scsearch",
      soundcloud: "scsearch"
    };
    return map[String(source).toLowerCase()] || source || "ytmsearch";
  }

  async search(query, { source = "ytmsearch", requester } = {}) {
    const q = String(query || "").trim();
    if (!q) return null;
    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    const selected = this.normalizeSource(source);
    const sources = this.isUrl(q)
      ? [selected]
      : selected === "ytmsearch"
        ? ["ytmsearch", "ytsearch"]
        : selected === "spsearch"
          ? ["spsearch", "ytmsearch", "ytsearch"]
          : selected === "scsearch"
            ? ["scsearch", "ytsearch"]
            : [selected, "ytsearch"];

    const attempt = async node => {
      for (const src of [...new Set(sources)]) {
        try {
          const result = await timeout(
            node.search({ query: q, source: src }, requester),
            8000,
            "Search timed out."
          );
          if (result?.tracks?.length || result?.loadType === "playlist") return result;
        } catch (error) {
          logger.warn("MusicEngine", "Search failed on " + node.id + " [" + src + "]: " + (error?.message || error));
        }
      }
      throw new Error("No result");
    };

    try {
      return await Promise.any(nodes.map(attempt));
    } catch {
      return null;
    }
  }

  async resolve(query, options = {}) {
    return this.search(query, options);
  }

  async createPlayer({ guildId, textChannelId, voiceChannelId }) {
    const existing = this.getPlayer(guildId);
    if (existing) {
      if (existing.voiceChannelId !== voiceChannelId) {
        await timeout(existing.changeVoiceState({ channelId: voiceChannelId }), 10000, "Voice channel change timed out.");
      }
      return existing;
    }

    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    let volume = 100;
    let autoplay = false;
    let mode247 = false;
    try {
      volume = Number(db.guild.getDefaultVolume(guildId)) || 100;
      const settings = db.guild.getMusicSettings(guildId);
      autoplay = Boolean(settings.autoplay);
      mode247 = Boolean(settings.mode247);
    } catch {}

    for (const node of nodes) {
      try {
        const player = this.lavalink.createPlayer({
          guildId,
          voiceChannelId,
          textChannelId,
          selfDeaf: true,
          selfMute: false,
          volume: Math.max(1, Math.min(200, volume)),
          node
        });
        player.set("autoplayEnabled", autoplay);
        player.set("stay247", mode247);
        player.set("stayAlive", autoplay || mode247);
        await timeout(player.connect(), 12000, "Voice connection timed out.");
        return player;
      } catch (error) {
        logger.warn("MusicEngine", "Player creation failed on " + node.id + ": " + (error?.message || error));
        await this.lavalink.getPlayer(guildId)?.destroy("Music node failover", true).catch(() => {});
      }
    }
    return null;
  }

  getPlayer(guildId) {
    return this.lavalink.getPlayer(guildId) || null;
  }

  getDefaultVolume(guildId) {
    try { return db.guild.getDefaultVolume(guildId) || 100; } catch { return 100; }
  }

  setDefaultVolume(guildId, value) {
    try {
      db.guild.setDefaultVolume(guildId, Math.max(1, Math.min(100, Number(value))));
      return true;
    } catch { return false; }
  }

  async is247ModeEnabled(guildId) {
    try { return db.guild.get247Settings(guildId).enabled === true; } catch { return false; }
  }

  getHistory(guildId) { return this.history.get(guildId) || []; }
  getLikes(userId) { return this.likes.get(userId) || []; }

  toggleLike(userId, track) {
    if (!userId || !track?.info?.identifier) return false;
    const list = this.likes.get(userId) || [];
    const index = list.findIndex(x => x.identifier === track.info.identifier);
    if (index >= 0) {
      list.splice(index, 1);
      this.likes.set(userId, list);
      return false;
    }
    list.unshift({
      identifier: track.info.identifier,
      title: track.info.title,
      author: track.info.author || "Unknown",
      uri: track.info.uri || null
    });
    this.likes.set(userId, list.slice(0, 100));
    return true;
  }

  refreshVoiceStayAlive(guildId, joined = true) {
    const player = this.getPlayer(guildId);
    if (!player) return null;
    const guild = this.client.guilds.cache.get(guildId);
    const channel = guild?.channels?.cache?.get(player.voiceChannelId);
    const humans = channel?.members?.filter(member => !member.user.bot).size ?? 0;
    let autoplay = player.get("autoplayEnabled") === true;
    let mode247 = player.get("stay247") === true;
    try {
      const settings = db.guild.getMusicSettings(guildId);
      autoplay ||= Boolean(settings.autoplay);
      mode247 ||= Boolean(settings.mode247);
    } catch {}
    player.set("stayAlive", autoplay || mode247);
    if (this.emptyTimers.has(guildId)) {
      clearTimeout(this.emptyTimers.get(guildId));
      this.emptyTimers.delete(guildId);
    }
    if (humans > 0 || joined || autoplay || mode247) return player;

    const timer = setTimeout(async () => {
      this.emptyTimers.delete(guildId);
      const current = this.getPlayer(guildId);
      if (!current) return;
      const g = this.client.guilds.cache.get(guildId);
      const c = g?.channels?.cache?.get(current.voiceChannelId);
      const count = c?.members?.filter(member => !member.user.bot).size ?? 0;
      if (count === 0 && !current.get("stayAlive") && !current.queue.current && current.queue.tracks.length === 0) {
        await current.destroy("Voice channel empty", true).catch(() => {});
      }
    }, 60000);
    this.emptyTimers.set(guildId, timer);
    return player;
  }

  async _queueEnd(player) {
    try {
      const settings = db.guild.getMusicSettings(player.guildId);
      const autoplay = player.get("autoplayEnabled") === true || Boolean(settings.autoplay);
      const mode247 = player.get("stay247") === true || Boolean(settings.mode247);
      if (autoplay) {
        const last = player.get("lastPlayedTrack");
        if (last?.info?.title) {
          const q = [last.info.author, last.info.title].filter(Boolean).join(" ");
          const result = await this.search(q, { source: "ytmsearch" });
          const next = result?.tracks?.find(track => track?.info?.identifier);
          if (next) {
            await player.queue.add(next);
            if (!player.playing) await player.play();
            return;
          }
        }
      }
      player.set("stayAlive", autoplay || mode247);
      if (!autoplay && !mode247) {
        setTimeout(async () => {
          const current = this.getPlayer(player.guildId);
          if (current && !current.get("stayAlive") && !current.queue.current && current.queue.tracks.length === 0) {
            await current.destroy("Queue finished", true).catch(() => {});
          }
        }, 60000);
      }
    } catch (error) {
      logger.warn("MusicEngine", "Queue-end handling failed: " + (error?.message || error));
    }
  }
}
