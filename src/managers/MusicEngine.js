import { LavalinkManager } from "lavalink-client";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import { PlayerManager } from "#managers/PlayerManager";
import { nowPlayingEmbed, v2Payload } from "#utils/MusicCore";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const AUTOPLAY_QUERIES = [
  "popular songs",
  "trending songs",
  "new songs",
  "hindi songs",
  "bollywood songs",
  "english pop songs",
  "lofi music",
  "viral songs"
];
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
    this.autoplayBusy = new Set();
    this.stuckRetries = new Map();
    this.ready = false;
    this.lastUnavailable = 0;

    this.lavalink = new LavalinkManager({
      nodes: (Array.isArray(config.nodes) && config.nodes.length ? config.nodes : [{
        id: "lightcore-lavalink",
        host: process.env.LAVALINK_HOST || "lightcore-lavalink-v4.onrender.com",
        port: Number(process.env.LAVALINK_PORT || 443),
        password: process.env.LAVALINK_SERVER_PASSWORD || "LightCore-Music-Node-2026",
        secure: (process.env.LAVALINK_SECURE || "true") === "true"
      }]).map(node => ({
        ...node,
        authorization: node.authorization || node.password,
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
        // Restore saved 24/7 voice sessions after a process restart.
        this._restore247Players().catch(error => logger.warn("MusicEngine", "24/7 session restore failed: " + (error?.message || error)));
      } catch (error) {
        this.ready = true;
        logger.error("MusicEngine", "Music engine initialization failed", error);
      }
    };
    if (this.client.isReady?.()) await start();
    else await new Promise(resolve => this.client.once("clientReady", async () => { await start(); resolve(); }));
  }

  async _restore247Players() {
    let saved = [];
    try { saved = db.guild.getAll247Guilds(); } catch (error) {
      logger.warn("MusicEngine", "Could not load saved 24/7 sessions: " + (error?.message || error));
      return;
    }
    if (!saved.length) return;
    const nodes = await this.waitForNode(20000);
    if (!nodes.length) {
      logger.warn("MusicEngine", "Saved 24/7 sessions will not restore until a Lavalink node is available.");
      return;
    }
    for (const row of saved) {
      const guildId = row.id;
      const voiceChannelId = row.stay_247_voice_channel;
      if (!guildId || !voiceChannelId || this.getPlayer(guildId)) continue;
      const guild = this.client.guilds.cache.get(guildId);
      const voice = guild?.channels?.cache?.get(voiceChannelId);
      if (!guild || !voice || !voice.isVoiceBased?.()) {
        logger.warn("MusicEngine", "Skipping 24/7 restore; saved voice channel is unavailable in guild " + guildId + ".");
        continue;
      }
      const textChannelId = row.stay_247_text_channel || voiceChannelId;
      const player = await this.createPlayer({ guildId, voiceChannelId, textChannelId });
      if (player) {
        player.set("stay247", true);
        player.set("stayAlive", true);
        logger.success("MusicEngine", "Restored 24/7 voice session for guild " + guildId + ".");
      }
    }
  }

  _bindEvents() {
    this.lavalink.nodeManager?.on("connect", node => {
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

    this.lavalink.on("trackStart", async (player, track) => {
      if (!track?.info?.title) return;
      player.set("lightcorePlaybackFallbackUsed", false);
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

      try {
        if (typeof player.setFilters === "function") {
          await player.setFilters({
            timescale: { speed: 1.0, pitch: 1.0, rate: 1.0 }
          });
        } else if (player.filterManager?.resetFilters) {
          await player.filterManager.resetFilters();
        }
        player.set("lightcorePlaybackSpeed", 1);
      } catch (filterError) {
        logger.warn(
          "MusicEngine",
          "Could not normalize playback speed for [" + player.guildId + "]: " +
          (filterError?.message || filterError)
        );
      }

      try {
        const textChannel = player.textChannelId
          ? await this.client.channels.fetch(player.textChannelId).catch(() => null)
          : null;
        if (textChannel?.isTextBased?.()) {
          const panel = nowPlayingEmbed(new PlayerManager(player));
          await textChannel.send(v2Payload(panel));
        }
      } catch (panelError) {
        logger.warn(
          "MusicEngine",
          "Could not send new-song control panel [" + player.guildId + "]: " +
          (panelError?.message || panelError)
        );
      }

      this.stuckRetries.delete(player.guildId);
      this.refreshVoiceStayAlive(player.guildId, true);
    });

    this.lavalink.on("trackEnd", player => this.refreshVoiceStayAlive(player.guildId));
    this.lavalink.on("trackError", async (player, track, payload) => {
      const reason = payload?.exception?.message || payload?.message || "unknown";
      logger.error("MusicEngine", "Track error [" + player?.guildId + "]: " + reason);

      if (!player || player.get("lightcorePlaybackFallbackUsed") === true) return;
      player.set("lightcorePlaybackFallbackUsed", true);

      try {
        const title = track?.info?.title || "";
        const author = track?.info?.author || "";
        const query = [author, title].filter(Boolean).join(" ").trim();
        if (!query) return;

        const nodes = await this.waitForNode(5000);
        for (const node of nodes) {
          try {
            const result = await timeout(
              node.search({ query, source: "scsearch" }, track?.requester),
              7000,
              "Fallback search timed out."
            );
            const fallback = result?.tracks?.find(item => item?.info?.identifier);
            if (!fallback) continue;

            await player.stopPlaying(false, false).catch(() => {});
            await player.play({ clientTrack: fallback });
            logger.warn("MusicEngine", "Switched to SoundCloud fallback for [" + query + "].");
            return;
          } catch {}
        }
      } catch (fallbackError) {
        logger.warn("MusicEngine", "Playback fallback failed: " + (fallbackError?.message || fallbackError));
      } finally {
        if (!player.playing) player.set("lightcorePlaybackFallbackUsed", false);
      }
    });

    this.lavalink.on("trackStuck", async (player, track, payload) => {
      if (!player || !track) return;
      const guildId = player.guildId;
      const retries = this.stuckRetries.get(guildId) || 0;
      logger.warn(
        "MusicEngine",
        "Track stuck [" + guildId + "] after " + (payload?.thresholdMs || "?") + "ms (retry " + (retries + 1) + ")"
      );

      if (retries < 1) {
        this.stuckRetries.set(guildId, retries + 1);
        try {
          await player.stopPlaying(false, false).catch(() => {});
          await player.queue.add(track, 0).catch(() => {});
          await player.play({ noReplace: true });
          return;
        } catch (error) {
          logger.warn("MusicEngine", "Stuck-track restart failed: " + (error?.message || error));
        }
      }

      this.stuckRetries.delete(guildId);
      try {
        const fallbackQuery = [track.info?.author, track.info?.title].filter(Boolean).join(" ").trim();
        if (!fallbackQuery) return;
        const result = await this.search(fallbackQuery, { source: "scsearch", requester: track.requester });
        const fallback = result?.tracks?.find(item => item?.info?.identifier);
        if (!fallback) return;
        await player.stopPlaying(false, false).catch(() => {});
        await player.queue.add(fallback, 0);
        await player.play({ noReplace: true });
        logger.warn("MusicEngine", "Recovered stuck track with SoundCloud fallback [" + guildId + "].");
      } catch (error) {
        logger.warn("MusicEngine", "Stuck-track fallback failed: " + (error?.message || error));
      }
    });
    this.lavalink.on("playerVoiceJoin", player => this.refreshVoiceStayAlive(player.guildId, true));
    this.lavalink.on("playerVoiceLeave", player => this.refreshVoiceStayAlive(player.guildId, false));
    this.lavalink.on("queueEnd", (player, endedTrack) => this._queueEnd(player, endedTrack));
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
        ? ["ytsearch", "ytmsearch", "scsearch"]
        : selected === "spsearch"
          ? ["spsearch", "ytsearch", "ytmsearch", "scsearch"]
          : selected === "scsearch"
            ? ["scsearch", "ytsearch", "ytmsearch"]
            : [selected, "ytsearch", "ytmsearch", "scsearch"];

    const attempt = async node => {
      for (const src of [...new Set(sources)]) {
        try {
          try {
            const result = await timeout(
              node.search({ query: q, source: src }, requester),
              8000,
              "Search timed out."
            );
            if (result?.tracks?.length || result?.loadType === "playlist") return result;
          } catch (searchError) {
            logger.warn("MusicEngine", "Client search failed on " + node.id + " [" + src + "]: " + (searchError?.message || searchError));
          }

          try {
            const identifier = this.isUrl(q) ? q : src + ":" + q;
            const raw = await timeout(
              node.request("/loadtracks?identifier=" + encodeURIComponent(identifier)),
              8000,
              "Direct Lavalink search timed out."
            );
            if (raw?.loadType === "search" && Array.isArray(raw.data) && raw.data.length) {
              return { loadType: "search", tracks: raw.data, data: raw.data };
            }
            if (raw?.loadType === "playlist" && raw.data?.tracks?.length) {
              return { loadType: "playlist", tracks: raw.data.tracks, data: raw.data };
            }
            if (raw?.loadType === "track" && raw.data) {
              return { loadType: "track", tracks: [raw.data], data: raw.data };
            }
          } catch (restError) {
            logger.warn("MusicEngine", "Direct Lavalink search failed on " + node.id + " [" + src + "]: " + (restError?.message || restError));
          }
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

  async _pickAutoplayTrack(player, endedTrack) {
    const recent = new Set(
      (this.history.get(player.guildId) || [])
        .slice(0, 12)
        .map(item => item?.identifier || item?.uri || item?.title)
        .filter(Boolean)
    );

    const blocked = new Set(recent);
    const currentId = endedTrack?.info?.identifier || player.get("lastPlayedTrack")?.info?.identifier;
    if (currentId) blocked.add(currentId);

    for (const queued of player.queue?.tracks || []) {
      if (queued?.info?.identifier) blocked.add(queued.info.identifier);
    }

    for (let attempt = 0; attempt < AUTOPLAY_QUERIES.length; attempt++) {
      const query = AUTOPLAY_QUERIES[Math.floor(Math.random() * AUTOPLAY_QUERIES.length)];
      try {
        const result = await this.search(query, { source: "ytmsearch", requester: endedTrack?.requester });
        const candidates = (result?.tracks || []).filter(track => {
          const id = track?.info?.identifier;
          const uri = track?.info?.uri;
          const title = track?.info?.title;
          return id && !blocked.has(id) && !blocked.has(uri) && !blocked.has(title);
        });
        if (candidates.length) {
          return candidates[Math.floor(Math.random() * candidates.length)];
        }
      } catch (error) {
        logger.warn("MusicEngine", "Autoplay discovery failed: " + (error?.message || error));
      }
    }

    return null;
  }

  async _queueEnd(player, endedTrack) {
    if (!player || this.autoplayBusy.has(player.guildId)) return;
    this.autoplayBusy.add(player.guildId);

    try {
      const settings = db.guild.getMusicSettings(player.guildId);
      const autoplay = player.get("autoplayEnabled") === true || Boolean(settings.autoplay);
      const mode247 = player.get("stay247") === true || Boolean(settings.mode247);

      if (autoplay) {
        const next = await this._pickAutoplayTrack(player, endedTrack);
        if (next) {
          await player.queue.add(next);
          if (!player.playing && !player.queue.current) {
            await player.play({ noReplace: true });
          }
          player.set("stayAlive", true);
          logger.info("MusicEngine", "Autoplay selected a new track [" + player.guildId + "]: " + (next.info?.title || "Unknown"));
          return;
        }

        logger.warn("MusicEngine", "Autoplay could not find a new track [" + player.guildId + "].");
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
    } finally {
      this.autoplayBusy.delete(player.guildId);
    }
  }
}
