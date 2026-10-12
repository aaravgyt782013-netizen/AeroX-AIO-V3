import dotenv from "dotenv";
dotenv.config();

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || ".",
  ownerIds: (process.env.OWNER_IDS || "").split(",").map(x => x.trim()).filter(Boolean),
  sharding: { totalShards: process.env.TOTAL_SHARDS === "auto" || !process.env.TOTAL_SHARDS ? "auto" : parseInt(process.env.TOTAL_SHARDS, 10), shardsPerCluster: parseInt(process.env.SHARDS_PER_CLUSTER, 10) || 2 },
  environment: process.env.NODE_ENV || "development",
  debug: process.env.DEBUG === "true" || process.env.NODE_ENV === "development",
  database: { guild: "./database/data/guild.bread", user: "./database/data/user.bread", premium: "./database/data/premium.bread", antiabuse: "./database/data/antiabuse.bread", ticket: "./database/data/ticket.bread", invites: "./database/data/invites.bread", automation: "./database/data/automation.bread" },
  music: {
    enabled: process.env.MUSIC_ENABLED !== "false",
    defaultVolume: Math.min(100, Math.max(1, Number.parseInt(process.env.MUSIC_DEFAULT_VOLUME || "70", 10) || 70)),
    maxQueue: Math.min(500, Math.max(10, Number.parseInt(process.env.MUSIC_MAX_QUEUE || "100", 10) || 100)),
    nodes: (process.env.LAVALINK_NODES || "").split(",").map((entry, index) => {
      const [host, port, authorization, secure, id] = entry.trim().split(":");
      return host && port && authorization ? { id: id || `node-${index + 1}`, host, port: Number(port), authorization, secure: secure === "true" } : null;
    }).filter(Boolean),
    node: process.env.LAVALINK_HOST && process.env.LAVALINK_PORT && process.env.LAVALINK_PASSWORD ? [{ id: process.env.LAVALINK_ID || "main-node", host: process.env.LAVALINK_HOST, port: Number(process.env.LAVALINK_PORT), authorization: process.env.LAVALINK_PASSWORD, secure: process.env.LAVALINK_SECURE === "true" }] : [],
  },
  links: { supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/aerox" },
  status: { name: process.env.STATUS_TEXT || ".help | LightCore", status: process.env.STATUS_TYPE || "dnd", type: "CUSTOM" },
  colors: { info: "#3498db", success: "#2ecc71", warning: "#f39c12", error: "#e74c3c" },
  assets: { defaultThumbnail: process.env.DEFAULT_THUMBNAIL || null, helpThumbnail: process.env.HELP_THUMBNAIL || null, bannerUrl: process.env.BANNER_URL || null },
  getThumbnailUrl: url => url || null,
  watermark: "LightCore",
  version: "6.0.0"
};