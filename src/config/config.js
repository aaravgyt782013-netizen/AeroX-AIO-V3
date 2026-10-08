import dotenv from "dotenv";
dotenv.config();

const PUBLIC_LAVALINK_NODES = [
  { id: "lightcore-heavencloud-ssl", host: "lavalink.heavencloud.in", port: 443, authorization: "heavencloud", secure: true },
  { id: "lightcore-heavencloud-http", host: "lavalink.heavencloud.in", port: 2333, authorization: "heavencloud", secure: false },
  { id: "lightcore-itzrandom", host: "node.itzrandom.cloud", port: 9000, authorization: "lavalink@itzrandomcloud", secure: false },
  { id: "lightcore-apex-v4", host: "v4.bloggertasher.ru", port: 26040, authorization: "apexnodes.xyz", secure: false },
  { id: "lightcore-lightsout-v4", host: "LavaLink4.lightsout.in", port: 40069, authorization: "LightsoutOwnsElves", secure: false },
  { id: "lightcore-catfein", host: "lava.catfein.com", port: 4000, authorization: "catfein", secure: false },
  { id: "lightcore-meww", host: "n2.meww.me", port: 2555, authorization: "meww.me", secure: false },
  { id: "lightcore-rudracloud", host: "lavalink.rudracloud.com", port: 2333, authorization: "RudraCloud.com", secure: false },
  { id: "lightcore-creavite", host: "us1.lavalink.creavite.co", port: 20080, authorization: "auto.creavite.co", secure: false },
  { id: "lightcore-akshat", host: "lava.akshat.tech", port: 443, authorization: "admin", secure: true },
  { id: "lightcore-charlesnaig", host: "lavahatry4.techbyte.host", port: 3000, authorization: "NAIGLAVA-dash.techbyte.host", secure: false },
  { id: "lightcore-zoldy", host: "139.99.124.43", port: 7780, authorization: "PasswordIsZoldy", secure: false }
];

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