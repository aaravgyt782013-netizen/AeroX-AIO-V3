import { LavalinkManager } from "lavalink-client";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const spotifyOEmbed = async url => {
  try {
    const r = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(url));
    if (!r.ok) return null;
    const data = await r.json();
    return data?.title || null;
  } catch {
    return null;
  }
};

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
    const nodes = (config.nodes || []).map(node => ({
      ...node,
      retryAmount: Infinity,
      retryDelay: Number(node.retryDelay || 5000),
      resumeTimeout: 120000,
      requestTimeout: 15000
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
      autoSkip: true,
      autoSkipOnResolveError: true,
      emitNewSongsOnly: false,
      client: {
        id: config.clientId || this.client.user?.id,
        username: this.client.user?.username || "LightCore"
      },
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        useUnresolvedData: true,
        maxErrorsPerTime: { threshold: 15000, maxAmount: 5 },
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: {
          destroyAfterMs: 30000,
          autoPlayFunction: async player => {
            if (!player.get("autoplayEnabled")) return;
            const last = player.queue.previous?.[0] || player.queue.current;
            if (!last?.info?.title) return;
            try {
              const query = [last.info.title, last.info.author].filter(Boolean).join(" ");
              const result = await player.search({ query, source: "ytmsearch" });
              const previous = new Set(
                (player.queue.previous || []).slice(0, 10)
                  .map(t => t?.info?.identifier).filter(Boolean)
              );
              const next = result?.tracks?.find(t => t?.info?.identifier && !previous.has(t.info.identifier));
              if (next) await player.queue.add(next);
            } catch (error) {
              logger.warn("MusicManager", "Autoplay failed: " + (error?.message || error));
            }
          }
        }
      },
      queueOptions: { maxPreviousTracks: 50 },
      linksAllowed: true,
      linksBlacklist: [],
      linksWhitelist: []
    });

    this.lavalink.nodeManager?.on("connect", node => {
      try { node.updateSession?.(true, 120000); } catch {}
      logger.success("MusicManager", "Lavalink connected: " + (node?.id || "unknown"));
    });
    this.lavalink.nodeManager?.on("resumed", (node) =>
      logger.info("MusicManager", "Lavalink session resumed: " + (node?.id || "unknown"))
    );
    this.lavalink.nodeManager?.on("reconnecting", node =>
      logger.warn("MusicManager", "Lavalink reconnecting: " + (node?.id || "unknown"))
    );
    this.lavalink.nodeManager?.on("disconnect", (node, reason) =>
      logger.warn("MusicManager", "Lavalink disconnected [" + (node?.id || "unknown") + "]: " + (reason?.message || reason || "unknown"))
    );
    this.lavalink.nodeManager?.on("error", (node, error) =>
      logger.error("MusicManager", "Lavalink node error [" + (node?.id || "unknown") + "]", error)
    );

    this.lavalink.on("trackStart", (player, track) => {
      if (!track?.info?.title) return;
      const list = this.history.get(player.guildId) || [];
      list.unshift({
        title: track.info.title,
        author: track.info.author || "Unknown",
        uri: track.info.uri || null,
        requester: track.requester?.id || track.info?.userData?.requesterId || null,
        at: Date.now()
      });
      this.history.set(player.guildId, list.slice(0, 50));

      const channel = this.client.channels.cache.get(player.textChannelId);
      let announce = true;
      try { announce = db.guild.getMusicSettings(player.guildId).announceSongs !== false; } catch {}
      if (announce && channel) {
        channel.send({ content: "🎶 **Now Playing:** " + track.info.title }).catch(() => {});
      }
    });

    this.lavalink.on("trackEnd", (player, track) =>
      logger.debug("MusicManager", "Track ended in " + (player?.guildId || "unknown") + ": " + (track?.info?.title || "unknown"))
    );
    this.lavalink.on("trackError", (player, track, payload) =>
      logger.error("MusicManager", "Track error [" + (player?.guildId || "unknown") + "]: " + (payload?.exception?.message || payload?.message || "unknown"))
    );
    this.lavalink.on("trackStuck", (player, track, payload) =>
      logger.warn("MusicManager", "Track stuck [" + (player?.guildId || "unknown") + "] after " + (payload?.thresholdMs || "?") + "ms")
    );
    this.lavalink.on("playerSocketClosed", (player, payload) =>
      logger.warn("MusicManager", "Voice socket closed [" + (player?.guildId || "unknown") + "]: " + (payload?.reason || payload?.code || "unknown"))
    );

    this.readyPromise = new Promise(resolve => {
      const onReady = async () => {
        try {
          await this.lavalink.init({
            id: this.client.user.id,
            username: this.client.user.username
          });
          logger.success("MusicManager", "Rythm-style music core initialized.");
        } catch (error) {
          logger.error("MusicManager", "Lavalink initialization failed", error);
        } finally {
          this.initialized = true;
          resolve();
        }
      };
      if (this.client.isReady?.()) onReady();
      else this.client.once("ready", onReady);
    });
  }

  getConnectedNodes() {
    try {
      const nodes = this.lavalink?.nodeManager?.leastUsedNodes?.("players") || [];
      return Array.isArray(nodes) ? nodes : [];
    } catch {
      return [];
    }
  }

  async waitForNode(timeout = 20000) {
    if (this.readyPromise && !this.initialized) {
      await Promise.race([this.readyPromise, sleep(Math.min(timeout, 10000))]);
    }
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const nodes = this.getConnectedNodes();
      if (nodes.length) return nodes;
      if (this.lavalink?.useable) {
        const fallback = this.getConnectedNodes();
        if (fallback.length) return fallback;
      }
      await sleep(500);
    }
    if (Date.now() - this.lastNodeWarning > 30000) {
      this.lastNodeWarning = Date.now();
      logger.warn("MusicManager", "No connected Lavalink node is available.");
    }
    return [];
  }

  isUrl(value) {
    try { new URL(String(value)); return true; } catch { return false; }
  }

  normalizeSource(source = "ytmsearch") {
    const map = {
      yt: "ytsearch", youtube: "ytsearch",
      ytm: "ytmsearch", youtubemusic: "ytmsearch",
      sp: "spsearch", spotify: "spsearch",
      sc: "scsearch", soundcloud: "scsearch"
    };
    return map[String(source).toLowerCase()] || source || "ytmsearch";
  }

  async createPlayer({ guildId, textChannelId, voiceChannelId }) {
    if (!guildId || !textChannelId || !voiceChannelId) return null;

    const existing = this.lavalink?.getPlayer(guildId);
    if (existing) {
      if (existing.voiceChannelId !== voiceChannelId) {
        await existing.changeVoiceState?.({ channelId: voiceChannelId }).catch(() => {});
      }
      return existing;
    }

    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    let volume = 100;
    let autoplay = false;
    try {
      volume = Number(db.guild.getDefaultVolume(guildId)) || 100;
      autoplay = Boolean(db.guild.getMusicSettings(guildId).autoplay);
    } catch {}
    volume = Math.max(1, Math.min(200, volume));

    try {
      const player = this.lavalink.createPlayer({
        guildId,
        voiceChannelId,
        textChannelId,
        selfDeaf: true,
        selfMute: false,
        volume,
        node: nodes[0]
      });
      player.set("autoplayEnabled", autoplay);
      await player.connect();
      return player;
    } catch (error) {
      logger.error("MusicManager", "Player creation failed", error);
      return null;
    }
  }

  async search(query, { source = "ytmsearch", requester } = {}) {
    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    const q = String(query || "").trim();
    if (!q) return null;

    let requested = this.normalizeSource(source);
    if (this.isUrl(q) && /open\.spotify\.com/i.test(q)) {
      const title = await spotifyOEmbed(q);
      if (title) {
        requested = "ytmsearch";
        return this.search(title, { source: requested, requester });
      }
    }

    const sources = [requested];
    if (requested === "ytmsearch") sources.push("ytsearch");
    if (requested === "spsearch") sources.push("ytmsearch", "ytsearch");
    if (requested === "scsearch") sources.push("ytsearch");

    for (const node of nodes) {
      for (const src of [...new Set(sources)]) {
        try {
          const result = await node.search({ query: q, source: src }, requester);
          if (result?.tracks?.length || result?.loadType === "playlist") return result;
        } catch (error) {
          logger.warn("MusicManager", "Search failed [" + node.id + "/" + src + "]: " + (error?.message || error));
        }
      }
    }
    return null;
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

  getHistory(guildId) { return this.history.get(guildId) || []; }

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

  getLikes(userId) { return this.likes.get(userId) || []; }
}
