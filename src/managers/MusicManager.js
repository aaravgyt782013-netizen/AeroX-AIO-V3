import { LavalinkManager } from "lavalink-client";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { spotifyManager } from "#utils/SpotifyManager";
import { createMusicPlayerV2 } from "#events/discord/music/Playerbuttons";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.initialized = false;
    this.readyPromise = null;
    this.lastNodeWarning = 0;
    this.panelMessages = new Map();
    this.init();
  }

  init() {
    try {
      this.lavalink = new LavalinkManager({
        nodes: (config.nodes || []).map((node) => ({
          ...node,
          sessionId: `lightcore_${config.clientId || "bot"}_${node.id}`,
          resumeKey: `lightcore_${config.clientId || "bot"}_${node.id}`,
          resumeTimeout: 120000,
          retryAmount: Infinity,
          retryDelay: 10000,
        })),
        sendToShard: (guildId, payload) => {
          if (this.client.cluster) {
            return this.client.cluster.broadcastEval(
              (client, context) => {
                const guild = client.guilds.cache.get(context.guildId);
                if (!guild) return false;
                guild.shard?.send(context.payload);
                return true;
              },
              { context: { guildId, payload } },
            );
          }
          return this.client.guilds.cache.get(guildId)?.shard?.send(payload);
        },
        autoSkip: true,
        autoSkipOnResolveError: true,
        emitNewSongsOnly: false,
        client: {
          id: config.clientId || this.client.user?.id,
          username: this.client.user?.username || "LightCore",
        },
        playerOptions: {
          maxErrorsPerTime: { threshold: 15000, maxAmount: 5 },
          minAutoPlayMs: 10000,
          applyVolumeAsFilter: false,
          clientBasedPositionUpdateInterval: 100,
          defaultSearchPlatform: "ytsearch",
          onDisconnect: { autoReconnect: true, destroyPlayer: false },
          onEmptyQueue: { destroyAfterMs: 300000 },
          useUnresolvedData: true,
          requesterTransformer: (requester) => requester,
        },
        queueOptions: {
          maxPreviousTracks: config.player?.maxHistorySize || 50,
        },
        linksAllowed: true,
        linksBlacklist: [],
        linksWhitelist: [],
        advancedOptions: {
          maxFilterFixDuration: 600000,
          debugOptions: {
            noAudio: false,
            playerDestroy: { dontThrowError: true },
          },
        },
      });

      this.lavalink.on("trackStart", (player, track) => {
        this.updateMusicPanel(player, track).catch((error) => {
          logger.debug("MusicManager", `Music panel update failed: ${error.message}`);
        });
      });

      this.readyPromise = new Promise((resolve) => {
        this.client.once("clientReady", async () => {
          try {
            await this.lavalink.init({
              id: this.client.user.id,
              username: this.client.user.username,
            });
          } finally {
            this.initialized = true;
            const nodes = this.getUsableNodes();
            if (nodes.length) {
              logger.success("MusicManager", `LightCore music ready — ${nodes.length} Lavalink node(s) connected.`);
            } else {
              logger.warn("MusicManager", "Music engine initialized; waiting for Lavalink connection.");
            }
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error("MusicManager", "Failed to initialize music system", error);
      this.initialized = false;
    }
  }

  async updateMusicPanel(player, track) {
    if (!player?.guildId || !track) return null;

    const channelId = player.textChannelId;
    const channel = channelId ? this.client.channels.cache.get(channelId) : null;
    if (!channel?.isTextBased?.()) return null;

    const guildSettings = db.guild.getMusicSettings(player.guildId);
    const paused = !!player.paused;
    const position = Number(player.position || track.info?.position || 0);
    const container = createMusicPlayerV2(track, guildSettings, paused, position);
    const payload = {
      components: [container],
      flags: 32768,
    };

    let message = null;
    const previous = this.panelMessages.get(player.guildId);
    if (previous) {
      try {
        message = await channel.messages.fetch(previous);
      } catch {}
    }

    if (message) {
      try {
        await message.edit(payload);
        return message;
      } catch {}
    }

    try {
      message = await channel.send(payload);
      this.panelMessages.set(player.guildId, message.id);
      return message;
    } catch (error) {
      logger.debug("MusicManager", `Unable to send music panel: ${error.message}`);
      return null;
    }
  }

  clearMusicPanel(guildId) {
    this.panelMessages.delete(guildId);
  }

  getUsableNodes() {
    try {
      return this.lavalink?.nodeManager?.leastUsedNodes("players") || [];
    } catch {
      return [];
    }
  }

  async waitForNode(timeout = 15000) {
    if (!this.initialized && this.readyPromise) {
      await Promise.race([this.readyPromise, sleep(timeout)]);
    }
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const nodes = this.getUsableNodes();
      if (nodes.length) return nodes;
      await sleep(500);
    }
    if (Date.now() - this.lastNodeWarning > 30000) {
      this.lastNodeWarning = Date.now();
      logger.warn("MusicManager", "No usable Lavalink node is connected.");
    }
    return [];
  }

  formatMS_HHMMSS(ms) {
    if (!ms || ms <= 0) return "0:00";
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  normalizeSource(source = "yt") {
    const map = {
      yt: "ytsearch", youtube: "ytsearch", ytm: "ytmsearch", youtubemusic: "ytmsearch",
      sp: "spsearch", spotify: "spsearch",
      sc: "scsearch", soundcloud: "scsearch",
      am: "amsearch", apple: "amsearch", applemusic: "amsearch",
      dz: "dzsearch", deezer: "dzsearch",
      js: "jssearch", jiosaavn: "jssearch", saavn: "jssearch",
    };
    return map[String(source).toLowerCase()] || source;
  }

  isUrl(value) {
    try { new URL(String(value)); return true; } catch { return false; }
  }

  async createPlayer(options) {
    if (!this.initialized) await this.waitForNode();
    const { guildId, textId, voiceId } = this.parsePlayerOptions(options);
    if (!guildId || !textId || !voiceId) return null;

    const existing = this.lavalink?.getPlayer(guildId);
    if (existing) {
      if (!existing.connected || existing.voiceChannelId !== voiceId) {
        try { await existing.connect(); } catch {}
      }
      return existing;
    }

    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    let volume = 100;
    try { volume = Number(db.guild.getDefaultVolume(guildId)) || 100; } catch {}
    volume = Math.max(1, Math.min(100, volume));

    try {
      const player = await this.lavalink.createPlayer({
        guildId,
        voiceChannelId: voiceId,
        textChannelId: textId,
        selfDeaf: true,
        selfMute: false,
        volume,
        instaUpdateFiltersFix: true,
        applyVolumeAsFilter: false,
      });
      if (!player) return null;

      const settings = db.guild.getMusicSettings(guildId);
      player.set("autoplayEnabled", !!settings.autoplay);
      player.set("announceSongs", !!settings.announceSongs);
      player.set("djRole", settings.djRole || null);

      if (!player.connected) await player.connect();
      return player;
    } catch (error) {
      logger.error("MusicManager", `Player creation failed: ${error.message}`);
      return null;
    }
  }

  async resolve(query, options = {}) {
    if (!query) return null;
    const requester = options.requester;
    const source = this.normalizeSource(options.source || "yt");
    if (!this.isUrl(query)) return this.search(query, { source, requester });

    const direct = await this.search(query, { source, requester, directUrl: true });
    if (direct?.tracks?.length || direct?.loadType === "playlist") return direct;

    try {
      const spotify = await spotifyManager.resolveUrl(this.client, query, requester);
      if (spotify) return spotify;
    } catch (error) {
      logger.debug("MusicManager", `Spotify URL fallback failed: ${error.message}`);
    }
    return null;
  }

  async searchAll(query, requester) {
    const results = await Promise.allSettled([
      this.search(query, { source: "ytsearch", requester }),
      this.search(query, { source: "spsearch", requester }),
      this.search(query, { source: "scsearch", requester }),
    ]);
    return {
      youtube: results[0].status === "fulfilled" ? results[0].value : null,
      spotify: results[1].status === "fulfilled" ? results[1].value : null,
      soundcloud: results[2].status === "fulfilled" ? results[2].value : null,
    };
  }

  async search(query, options = {}) {
    if (!query) return null;
    const nodes = await this.waitForNode();
    if (!nodes.length) return null;

    const requester = options.requester;
    const source = this.normalizeSource(options.source || config.search?.defaultSources?.[0] || "ytsearch");
    const attempts = [source];

    if (source === "ytsearch") attempts.push("ytmsearch");
    if (source === "ytmsearch") attempts.push("ytsearch");

    for (const node of nodes) {
      for (const attempt of [...new Set(attempts)]) {
        try {
          const result = await node.search({ query, source: attempt }, requester);
          if (result?.tracks?.length || result?.loadType === "playlist") return result;
        } catch (error) {
          logger.debug("MusicManager", `Search ${attempt} failed: ${error.message}`);
        }
      }
    }

    if (source === "spsearch") {
      try {
        const spotify = await spotifyManager.searchTrack(this.client, query, requester);
        if (spotify) return { loadType: "search", tracks: [spotify] };
      } catch {}
    }
    return null;
  }

  getPlayer(guildId) {
    return this.lavalink?.getPlayer(guildId);
  }

  getDefaultVolume(guildId) {
    try { return db.guild.getDefaultVolume(guildId); } catch { return 100; }
  }

  setDefaultVolume(guildId, volume) {
    try { db.guild.setDefaultVolume(guildId, volume); return true; } catch { return false; }
  }

  async is247ModeEnabled(guildId) {
    try { return db.guild.get247Settings(guildId).enabled === true; } catch { return false; }
  }

  parsePlayerOptions(options = {}) {
    if (options.guildId && options.textChannelId && options.voiceChannelId) {
      return { guildId: options.guildId, textId: options.textChannelId, voiceId: options.voiceChannelId };
    }
    if (options.guildId && options.textChannel && options.voiceChannel) {
      return { guildId: options.guildId, textId: options.textChannel.id, voiceId: options.voiceChannel.id };
    }
    return {};
  }
}
