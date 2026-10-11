import dotenv from "dotenv";
dotenv.config();

// Node priority: JSON pool, explicit host/password variables, then the existing
// hardcoded Lavalink endpoint as a compatibility fallback.
const nodeDefaults = { retryAmount: Infinity, retryDelay: 3000, resumeTimeout: 300000, requestTimeout: 15000 };

function parseLavalinkNodes() {
  // Requested hardcoded Serenetia Lavalink node. This deliberately takes
  // precedence over stale Render LAVALINK_* variables so the bot uses this
  // endpoint consistently; keep the credentials in this public config only
  // if the provider intends them to be public.
  return [{
    ...nodeDefaults,
    id: "serenetia-lavalink",
    host: "lavalinkv4.serenetia.com",
    port: 443,
    password: "https://seretia.link/discord",
    authorization: "https://seretia.link/discord",
    secure: true
  }];
}

const PUBLIC_LAVALINK_NODES = parseLavalinkNodes();

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || ".",
  ownerIds: (process.env.OWNER_IDS || "").split(",").map(x => x.trim()).filter(Boolean),
  sharding: { totalShards: process.env.TOTAL_SHARDS === "auto" || !process.env.TOTAL_SHARDS ? "auto" : parseInt(process.env.TOTAL_SHARDS, 10), shardsPerCluster: parseInt(process.env.SHARDS_PER_CLUSTER, 10) || 2 },
  nodes: PUBLIC_LAVALINK_NODES,
  environment: process.env.NODE_ENV || "development",
  debug: process.env.DEBUG === "true" || process.env.NODE_ENV === "development",
  // Render free web services cannot write to /var/data unless a persistent disk is mounted.
  // DATA_DIR can point to a mounted disk; default to a writable local directory for startup.
  database: (() => { const dir = (process.env.DATA_DIR || "./data").replace(/\/+$/, ""); return { guild: `${dir}/guild.sqlite`, user: `${dir}/user.sqlite`, premium: `${dir}/premium.sqlite`, antiabuse: `${dir}/antiabuse.sqlite`, playlists: `${dir}/playlists.sqlite`, ticket: `${dir}/ticket.sqlite`, invites: `${dir}/invites.sqlite`, automation: `${dir}/automation.sqlite` }; })(),
  links: { supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/aerox" },
  status: { name: process.env.STATUS_TEXT || ".help | LightCore", status: process.env.STATUS_TYPE || "dnd", type: "CUSTOM" },
  colors: { info: "#3498db", success: "#2ecc71", warning: "#f39c12", error: "#e74c3c" },
  features: { stay247: true, autoReactPremiumOnly: process.env.AUTOREACT_PREMIUM_ONLY !== "false" },
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