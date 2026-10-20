import dotenv from "dotenv";
dotenv.config();

const envBool = (value, fallback = false) => value == null || value === "" ? fallback : String(value).toLowerCase() === "true";
const commonPassword = process.env.LAVALINK_PASSWORD || "";
const lavalinkNodes = [
  {
    id: process.env.LAVALINK_NODE_1_ID || "millohost-primary",
    host: process.env.LAVALINK_NODE_1_HOST || "lava-v4.millohost.my.id",
    port: Number.parseInt(process.env.LAVALINK_NODE_1_PORT || "443", 10),
    authorization: process.env.LAVALINK_NODE_1_PASSWORD || commonPassword,
    secure: envBool(process.env.LAVALINK_NODE_1_SECURE, true),
  },
  {
    id: process.env.LAVALINK_NODE_2_ID || "millohost-secondary",
    host: process.env.LAVALINK_NODE_2_HOST || "lava4.millohost.my.id",
    port: Number.parseInt(process.env.LAVALINK_NODE_2_PORT || "443", 10),
    authorization: process.env.LAVALINK_NODE_2_PASSWORD || commonPassword,
    secure: envBool(process.env.LAVALINK_NODE_2_SECURE, true),
  },
].filter(node => node.host && Number.isInteger(node.port) && node.port > 0 && node.authorization);

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || ".",
  ownerIds: [...new Set([...(process.env.OWNER_IDS || "").split(",").map(x => x.trim()).filter(Boolean), "1538907226671022111"])],
  sharding: { totalShards: process.env.TOTAL_SHARDS === "auto" || !process.env.TOTAL_SHARDS ? "auto" : parseInt(process.env.TOTAL_SHARDS, 10), shardsPerCluster: parseInt(process.env.SHARDS_PER_CLUSTER, 10) || 2 },
  environment: process.env.NODE_ENV || "development",
  debug: process.env.DEBUG === "true" || process.env.NODE_ENV === "development",
  database: { guild: "./database/data/guild.bread", user: "./database/data/user.bread", premium: "./database/data/premium.bread", antiabuse: "./database/data/antiabuse.bread", ticket: "./database/data/ticket.bread", invites: "./database/data/invites.bread", automation: "./database/data/automation.bread" },
  music: {
    enabled: process.env.MUSIC_ENABLED !== "false",
    defaultVolume: Math.min(100, Math.max(1, Number.parseInt(process.env.MUSIC_DEFAULT_VOLUME || "70", 10) || 70)),
    maxQueue: Math.min(500, Math.max(10, Number.parseInt(process.env.MUSIC_MAX_QUEUE || "100", 10) || 100)),
    nodes: lavalinkNodes,
    node: [],
  },
  links: { supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/4waqdE9AVZ" },
  status: { name: process.env.STATUS_TEXT || ".help | LightCore", status: process.env.STATUS_TYPE || "dnd", type: process.env.STATUS_ACTIVITY_TYPE || "WATCHING" },
  colors: { info: "#3498db", success: "#2ecc71", warning: "#f39c12", error: "#e74c3c" },
  assets: { defaultThumbnail: process.env.DEFAULT_THUMBNAIL || null, helpThumbnail: process.env.HELP_THUMBNAIL || null, bannerUrl: process.env.BANNER_URL || null },
  getThumbnailUrl: url => url || null,
  watermark: "LightCore",
  version: "6.0.0"
};
