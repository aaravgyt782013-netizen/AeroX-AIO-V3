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
  links: { supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/aerox" },
  status: { name: process.env.STATUS_TEXT || ".help | LightCore", status: process.env.STATUS_TYPE || "dnd", type: "CUSTOM" },
  colors: { info: "#3498db", success: "#2ecc71", warning: "#f39c12", error: "#e74c3c" },
  assets: { defaultThumbnail: process.env.DEFAULT_THUMBNAIL || null, helpThumbnail: process.env.HELP_THUMBNAIL || null, bannerUrl: process.env.BANNER_URL || null },
  getThumbnailUrl: url => url || null,
  watermark: "LightCore",
  version: "6.0.0"
};