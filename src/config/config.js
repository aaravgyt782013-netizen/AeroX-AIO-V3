import dotenv from 'dotenv';
dotenv.config();

const PUBLIC_LAVALINK_NODES = [
  // Nazha Free Lavalink v4 — current public nodes (2026).
  // Keep these built into the bot so no LAVALINK_* Render variables are required.
  {
    id: "lightcore-sg-1",
    host: "sg-1.nazha.online",
    port: 443,
    authorization: "youshallnotpass",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 10000,
  },
  {
    id: "lightcore-sg-2",
    host: "sg-2.nazha.online",
    port: 443,
    authorization: "youshallnotpass",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 10000,
  },
  {
    id: "lightcore-sg-3",
    host: "sg-3.nazha.online",
    port: 443,
    authorization: "youshallnotpass",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 10000,
  },
  {
    id: "lightcore-global",
    host: "lavalink.nazha.online",
    port: 443,
    authorization: "youshallnotpass",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 10000,
  },
];

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || '.',
  ownerIds: (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),

  sharding: {
    totalShards: process.env.TOTAL_SHARDS === 'auto' || !process.env.TOTAL_SHARDS ? 'auto' : parseInt(process.env.TOTAL_SHARDS, 10),
    shardsPerCluster: parseInt(process.env.SHARDS_PER_CLUSTER, 10) || 2,
  },

  // Permanent built-in public Lavalink node.
  // Environment variables are intentionally ignored for the music node so Render
  // does not require LAVALINK_* variables.
  nodes: PUBLIC_LAVALINK_NODES,

  environment: process.env.NODE_ENV || 'development',
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',

  database: {
    guild: './database/data/guild.bread',
    user: './database/data/user.bread',
    premium: './database/data/premium.bread',
    antiabuse: './database/data/antiabuse.bread',
    playlists: './database/data/playlists.bread',
    ticket: './database/data/ticket.bread',
    invites: './database/data/invites.bread',
    automation: './database/data/automation.bread',
  },

  links: {
    supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/aerox"
  },

  status: {
    name: process.env.STATUS_TEXT || '!help | Discord Bot',
    status: process.env.STATUS_TYPE || 'dnd',
    type: 'CUSTOM'
  },

  colors: {
    info: '#3498db',
    success: '#2ecc71',
    warning: '#f39c12',
    error: '#e74c3c'
  },

  webhook: {
    enabled: process.env.WEBHOOK_ENABLED !== 'false',
    url: process.env.WEBHOOK_URL || null,
    username: process.env.WEBHOOK_USERNAME || 'Bot Logger',
    avatarUrl: process.env.WEBHOOK_AVATAR_URL || null,
    levels: {
      info: { enabled: process.env.WEBHOOK_INFO_ENABLED !== 'false' },
      success: { enabled: process.env.WEBHOOK_SUCCESS_ENABLED !== 'false' },
      warning: { enabled: process.env.WEBHOOK_WARNING_ENABLED !== 'false' },
      error: { enabled: process.env.WEBHOOK_ERROR_ENABLED !== 'false' },
      debug: { enabled: process.env.WEBHOOK_DEBUG_ENABLED === 'true' },
    }
  },

  features: { stay247: true },

  queue: {
    maxSongs: { free: 50, premium: 200 }
  },

  assets: {
    defaultTrackArtwork: process.env.DEFAULT_TRACK_ARTWORK || null,
    defaultThumbnail: process.env.DEFAULT_THUMBNAIL || null,
    helpThumbnail: process.env.HELP_THUMBNAIL || null,
    bannerUrl: process.env.BANNER_URL || null,
  },

  getThumbnailUrl(url) { return url || null; },

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  },

  lastfm: { apiKey: process.env.LASTFM_API_KEY },

  search: {
    maxResults: 6,
    defaultSources: ['ytsearch']
  },

  player: {
    defaultVolume: 100,
    seekStep: 10000,
    maxHistorySize: 50,
    stay247: {
      reconnectDelay: 5000,
      maxReconnectAttempts: 3,
      checkInterval: 30000
    },
    audioQuality: {
      bitrate: 320,
      sampleRate: 48000,
      channels: 2,
      bufferSize: 8192,
      highWaterMark: 1048576,
    }
  },

  watermark: 'coded by Shinchan',
  version: '3.0.0'
};
