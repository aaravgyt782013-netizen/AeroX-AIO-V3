import dotenv from "dotenv";
dotenv.config();

// Prefer a user-configured pool of maintained Lavalink v4 nodes.
// LAVALINK_NODES_JSON should be a JSON array of {id,host,port,password,secure}
// objects. This avoids shipping stale public endpoints or passwords in source.
const parseNodePool = () => {
  const raw = process.env.LAVALINK_NODES_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const nodes = parsed.filter(n =>
          n && typeof n.id === "string" && typeof n.host === "string" &&
          typeof n.password === "string" && n.host.trim() && n.password
        ).map(n => ({
          id: n.id.trim(),
          host: n.host.trim(),
          port: Number(n.port || 443),
          password: n.password,
          secure: n.secure === undefined ? true : Boolean(n.secure),
          retryAmount: Infinity,
          retryDelay: 5000,
          resumeTimeout: 300000
        })).filter(n => Number.isInteger(n.port) && n.port > 0 && n.port <= 65535);
        if (nodes.length) return nodes;
      }
    } catch (error) {
      console.error("[MusicEngine] LAVALINK_NODES_JSON is invalid JSON; checking single-node variables.");
    }
  }

  const host = process.env.LAVALINK_HOST?.trim();
  const password = process.env.LAVALINK_SERVER_PASSWORD || process.env.LAVALINK_PASSWORD;
  if (host && password) {
    return [{
      id: process.env.LAVALINK_NODE_ID || "configured-lavalink",
      host,
      port: Number(process.env.LAVALINK_PORT || 443),
      password,
      secure: (process.env.LAVALINK_SECURE || "true").toLowerCase() === "true",
      retryAmount: Infinity,
      retryDelay: 5000,
      resumeTimeout: 300000
    }];
  }

  // Compatibility fallback only. Public nodes can disappear or change
  // credentials; configure LAVALINK_NODES_JSON for a maintained node pool.
  return [{
    id: "lightcore-lavalink",
    host: "lightcore-lavalink-v4.onrender.com",
    port: 443,
    password: "LightCore-Music-Node-2026",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 5000,
    resumeTimeout: 300000
  }];
};

const PUBLIC_LAVALINK_NODES = parseNodePool();

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || ".",
  ownerIds: (process.env.OWNER_IDS || "").split(",").map(x => x.trim()).filter(Boolean),
  sharding: { totalShards: process.env.TOTAL_SHARDS === "auto" || !process.env.TOTAL_SHARDS ? "auto" : parseInt(process.env.TOTAL_SHARDS, 10), shardsPerCluster: parseInt(process.env.SHARDS_PER_CLUSTER, 10) || 2 },
  nodes: PUBLIC_LAVALINK_NODES,
  environment: process.env.NODE_ENV || "development",
  debug: process.env.DEBUG === "true" || process.env.NODE_ENV === "development",
  database: { guild: "./database/data/guild.bread", user: "./database/data/user.bread", premium: "./database/data/premium.bread", antiabuse: "./database/data/antiabuse.bread", playlists: "./database/data/playlists.bread", ticket: "./database/data/ticket.bread", invites: "./database/data/invites.bread", automation: "./database/data/automation.bread" },
  links: { supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/aerox" },
  status: { name: process.env.STATUS_TEXT || ".help | LightCore", status: process.env.STATUS_TYPE || "dnd", type: "CUSTOM" },
  colors: { info: "#3498db", success: "#2ecc71", warning: "#f39c12", error: "#e74c3c" },
  features: { stay247: true },
  queue: { maxSongs: { free: 50, premium: 200 } },
  assets: { defaultTrackArtwork: process.env.DEFAULT_TRACK_ARTWORK || null, defaultThumbnail: process.env.DEFAULT_THUMBNAIL || null, helpThumbnail: process.env.HELP_THUMBNAIL || null, bannerUrl: process.env.BANNER_URL || null },
  getThumbnailUrl: url => url || null,
  spotify: { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET },
  lastfm: { apiKey: process.env.LASTFM_API_KEY },
  search: { maxResults: 6, defaultSources: ["ytmsearch", "ytsearch"] },
  player: { defaultVolume: 100, seekStep: 10000, maxHistorySize: 50, stay247: { reconnectDelay: 5000, maxReconnectAttempts: 20, checkInterval: 30000 }, audioQuality: { bitrate: 320, sampleRate: 48000, channels: 2, bufferSize: 8192, highWaterMark: 1048576 } },
  watermark: "LightCore",
  version: "6.0.0"
};