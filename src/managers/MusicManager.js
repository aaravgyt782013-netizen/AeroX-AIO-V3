import { LavalinkManager } from "lavalink-client";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.lavalink = null;
    this.initialized = false;
    this.readyPromise = null;
    this.nodeCooldowns = new Map();
    this.nodeFailures = new Map();
    this.history = new Map();
    this.likes = new Map();
    this.emptyTimers = new Map();
    this.init();
  }

  init() {
    const nodes = (config.nodes || []).map(node => ({
      ...node,
      retryAmount: Infinity,
      retryDelay: Number(node.retryDelay || 5000),
      requestTimeout: 8000,
      resumeTimeout: 300000
    }));

    this.lavalink = new LavalinkManager({
      nodes,
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
      client: {
        id: config.clientId || this.client.user?.id,
        username: this.client.user?.username || "LightCore"
      },
      autoSkip: true,
      autoSkipOnResolveError: true,
      emitNewSongsOnly: false,
      linksAllowed: true,
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        useUnresolvedData: true,
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: { destroyAfterMs: -1, minAutoPlayMs: 3000 },
        maxErrorsPerTime: { threshold: 15000, maxAmount: 5 }
      },
      queueOptions: { maxPreviousTracks: 50 }
    });

    const nm = this.lavalink.nodeManager;
    nm?.on("connect", node => {
      const id = node?.id || "unknown";
      this.nodeCooldowns.delete(id);
      this.nodeFailures.delete(id);
      try { node.updateSession?.(true, 300000); } catch {}
      logger.success("Music", "Lavalink node connected: " + id);
    });
    nm?.on("ready", node => logger.success("Music", "Lavalink node ready: " + (node?.id || "unknown")));
    nm?.on("reconnecting", node => logger.warn("Music", "Reconnecting to " + (node?.id || "unknown")));
    nm?.on("disconnect", (node, reason) => this.markNodeFailure(node, reason));
    nm?.on("error", (node, error) => this.markNodeFailure(node, error));

    this.lavalink.on("trackStart", (player, track) => {
      if (!track?.info?.title) return;
      const list = this.history.get(player.guildId) || [];
      list.unshift({
        title: track.info.title,
        author: track.info.author || "Unknown",
        uri: track.info.uri || null,
        at: Date.now()
      });
      this.history.set(player.guildId, list.slice(0, 50));
      try {
        player.set("announceSongs", db.guild.getMusicSettings(player.guildId).announceSongs !== false);
      } catch {}
    });

    this.lavalink.on("trackEnd", player => this.refreshVoiceStayAlive(player.guildId));
    this.lavalink.on("trackError", (player, track, payload) => {
      logger.error("Music", "Track error [" + (player?.guildId || "unknown") + "]: " + (payload?.exception?.message || payload?.message || "unknown"));
    });
    this.lavalink.on("trackStuck", (player, track, payload) => {
      logger.warn("Music", "Track stuck [" + (player?.guildId || "unknown") + "] after " + (payload?.thresholdMs || "?") + "ms");
    });
    this.lavalink.on("playerVoiceJoin", player => this.refreshVoiceStayAlive(player.guildId, true));
    this.lavalink.on("playerVoiceLeave", player => this.refreshVoiceStayAlive(player.guildId, false));

    this.readyPromise = new Promise(resolve => {
      const start = async () => {
        try {
          await this.lavalink.init({
            id: this.client.user.id,
            username: this.client.user.username
          });
          logger.success("Music", "LightCore music engine initialized.");
        } catch (error) {
          logger.error("Music", "Music engine initialization failed", error);
        } finally {
          this.initialized = true;
          resolve();
        }
      };
      if (this.client.isReady?.()) start();
      else this.client.once("ready", start);
    });
  }

  markNodeFailure(node, error = "unknown") {
    const id = node?.id;
    if (!id) return;
    const failures = (this.nodeFailures.get(id) || 0) + 1;
    this.nodeFailures.set(id, failures);
    this.nodeCooldowns.set(id, Date.now() + Math.min(30000, 5000 * failures));
    logger.warn("Music", "Lavalink node failed [" + id + "]: " + (error?.message || error));
  }

  getAvailableNodes() {
    try {
      const nodes = this.lavalink?.nodeManager?.leastUsedNodes?.("players");
      if (!Array.isArray(nodes)) return [];
      const now = Date.now();
      return nodes.filter(node => (this.nodeCooldowns.get(node.id) || 0) <= now);
    } catch {
      return [];
    }
  }

  async waitForNode(timeout = 12000) {
    if (this.readyPromise && !this.initialized) {
      await Promise.race([this.readyPromise, sleep(5000)]);
    }
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const nodes = this.getAvailableNodes();
      if (nodes.length) return nodes;
      await sleep(400);
    }
    logger.warn("Music", "No Lavalink node became ready within " + timeout + "ms.");
    return [];
  }

  getSettings(guildId) {
    try {
      const s = db.guild.getMusicSettings(guildId);
      return {
        volume: Number(db.guild.getDefaultVolume(guildId)) || 100,
        autoplay: Boolean(s.autoplay),
        mode247: Boolean(s.mode247)
      };
    } catch {
      return { volume: 100, autoplay: false, mode247: false };
    }
  }

  async createPlayer({ guildId, textChannelId, voiceChannelId }) {
    if (!guildId || !textChannelId || !voiceChannelId) return null;

    const existing = this.getPlayer(guildId);
    if (existing) {
      if (existing.voiceChannelId !== voiceChannelId) {
        await existing.changeVoiceState?.({ channelId: voiceChannelId }).catch(() => {});
      }
      return existing;
    }

    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    const settings = this.getSettings(guildId);
    const volume = Math.max(1, Math.min(200, settings.volume));

    for (const node of nodes) {
      try {
        const player = this.lavalink.createPlayer({
          guildId,
          voiceChannelId,
          textChannelId,
          selfDeaf: true,
          selfMute: false,
          volume,
          node
        });
        player.set("autoplayEnabled", settings.autoplay);
        player.set("stay247", settings.mode247);
        player.set("stayAlive", settings.autoplay || settings.mode247);

        await Promise.race([
          player.connect(),
          sleep(10000).then(() => { throw new Error("Discord voice connection timed out"); })
        ]);
        this.refreshVoiceStayAlive(guildId, true);
        return player;
      } catch (error) {
        this.markNodeFailure(node, error);
        try { await this.lavalink.getPlayer(guildId)?.destroy("Music node failover", true); } catch {}
      }
    }
    return null;
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

  async searchNode(node, query, sources, requester) {
    for (const source of [...new Set(sources)]) {
      try {
        const result = await Promise.race([
          node.search({ query, source }, requester),
          sleep(7000).then(() => null)
        ]);
        if (result?.tracks?.length || result?.loadType === "playlist") return result;
      } catch (error) {
        logger.warn("Music", "Search failed [" + node.id + "/" + source + "]: " + (error?.message || error));
      }
    }
    throw new Error("No playable result from " + node.id);
  }

  async search(query, { source = "ytmsearch", requester } = {}) {
    const q = String(query || "").trim();
    if (!q) return null;

    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    const requested = this.normalizeSource(source);
    const sources = [requested];
    if (requested === "ytmsearch") sources.push("ytsearch");
    if (requested === "spsearch") sources.push("ytmsearch", "ytsearch");
    if (requested === "scsearch") sources.push("ytsearch");

    try {
      return await Promise.any(nodes.map(node => this.searchNode(node, q, sources, requester)));
    } catch {
      return null;
    }
  }

  async resolve(query, options = {}) {
    return this.search(query, options);
  }

  getPlayer(guildId) {
    return this.lavalink?.getPlayer(guildId) || null;
  }

  getDefaultVolume(guildId) {
    try { return db.guild.getDefaultVolume(guildId) || 100; } catch { return 100; }
  }

  setDefaultVolume(guildId, volume) {
    try {
      db.guild.setDefaultVolume(guildId, Math.max(1, Math.min(200, Number(volume))));
      return true;
    } catch { return false; }
  }

  async is247ModeEnabled(guildId) {
    try { return db.guild.get247Settings(guildId).enabled === true; } catch { return false; }
  }

  refreshVoiceStayAlive(guildId, joined = false) {
    const player = typeof guildId === "string" ? this.getPlayer(guildId) : guildId;
    if (player) this.refreshEmptyTimer(player, joined);
    return player || null;
  }

  refreshEmptyTimer(player, joined = false) {
    if (!player?.guildId) return;

    const old = this.emptyTimers.get(player.guildId);
    if (old) clearTimeout(old);
    this.emptyTimers.delete(player.guildId);

    const guild = this.client.guilds.cache.get(player.guildId);
    const channel = guild?.channels?.cache?.get(player.voiceChannelId);
    const humans = channel?.members?.filter(member => !member.user.bot).size || 0;

    let keepAlive = player.get("stayAlive") === true;
    try {
      const s = db.guild.getMusicSettings(player.guildId);
      keepAlive = keepAlive || Boolean(s.autoplay || s.mode247);
    } catch {}

    if (joined || humans > 0 || keepAlive) return;

    const timer = setTimeout(async () => {
      this.emptyTimers.delete(player.guildId);
      const latest = this.getPlayer(player.guildId);
      if (!latest) return;
      const latestGuild = this.client.guilds.cache.get(player.guildId);
      const latestChannel = latestGuild?.channels?.cache?.get(latest.voiceChannelId);
      const latestHumans = latestChannel?.members?.filter(member => !member.user.bot).size || 0;
      if (latestHumans === 0 && !latest.get("stayAlive")) {
        await latest.destroy("Voice channel empty", true).catch(() => {});
      }
    }, 60000);

    this.emptyTimers.set(player.guildId, timer);
  }

  getHistory(guildId) {
    return this.history.get(guildId) || [];
  }

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

  getLikes(userId) {
    return this.likes.get(userId) || [];
  }
}
