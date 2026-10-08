import dotenv from "dotenv";
dotenv.config();

const PUBLIC_LAVALINK_NODES = [
  {
    id: "lightcore-heavencloud-public",
    host: "free-lava.heavencloud.in",
    port: 4000,
    authorization: "heavencloud.in",
    auth: "heavencloud.in",
    secure: false,
    retryAmount: Infinity,
    retryDelay: 5000
  },
  {
    id: "lightcore-nazha-sg1",
    host: "sg-1.nazha.online",
    port: 443,
    authorization: "https://discord.gg/XeSCnk57ZF",
    auth: "https://discord.gg/XeSCnk57ZF",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 5000
  },
  {
    id: "lightcore-nazha-sg2",
    host: "sg-2.nazha.online",
    port: 443,
    authorization: "https://discord.gg/XeSCnk57ZF",
    auth: "https://discord.gg/XeSCnk57ZF",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 5000
  },
  {
    id: "lightcore-nazha-sg3",
    host: "sg-3.nazha.online",
    port: 443,
    authorization: "https://discord.gg/XeSCnk57ZF",
    auth: "https://discord.gg/XeSCnk57ZF",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 5000
  },
  {
    id: "lightcore-nazha-global",
    host: "lavalink.nazha.online",
    port: 443,
    authorization: "nazhafreelava",
    auth: "nazhafreelava",
    secure: true,
    retryAmount: Infinity,
    retryDelay: 5000
  }
];

export const config={
  token:process.env.DISCORD_TOKEN,
  clientId:process.env.CLIENT_ID,
  prefix:process.env.PREFIX||".",
  ownerIds:(process.env.OWNER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean),
  sharding:{totalShards:process.env.TOTAL_SHARDS==="auto"||!process.env.TOTAL_SHARDS?"auto":parseInt(process.env.TOTAL_SHARDS,10),shardsPerCluster:parseInt(process.env.SHARDS_PER_CLUSTER,10)||2},
  nodes:PUBLIC_LAVALINK_NODES,
  environment:process.env.NODE_ENV||"development",
  debug:process.env.DEBUG==="true"||process.env.NODE_ENV==="development",
  database:{guild:"./database/data/guild.bread",user:"./database/data/user.bread",premium:"./database/data/premium.bread",antiabuse:"./database/data/antiabuse.bread",playlists:"./database/data/playlists.bread",ticket:"./database/data/ticket.bread",invites:"./database/data/invites.bread",automation:"./database/data/automation.bread"},
  links:{supportServer:process.env.SUPPORT_SERVER_URL||"https://discord.gg/aerox"},
  status:{name:process.env.STATUS_TEXT||".help | LightCore",status:process.env.STATUS_TYPE||"dnd",type:"CUSTOM"},
  colors:{info:"#3498db",success:"#2ecc71",warning:"#f39c12",error:"#e74c3c"},
  features:{stay247:true},
  queue:{maxSongs:{free:50,premium:200}},
  assets:{defaultTrackArtwork:process.env.DEFAULT_TRACK_ARTWORK||null,defaultThumbnail:process.env.DEFAULT_THUMBNAIL||null,helpThumbnail:process.env.HELP_THUMBNAIL||null,bannerUrl:process.env.BANNER_URL||null},
  getThumbnailUrl:url=>url||null,
  spotify:{clientId:process.env.SPOTIFY_CLIENT_ID,clientSecret:process.env.SPOTIFY_CLIENT_SECRET},
  lastfm:{apiKey:process.env.LASTFM_API_KEY},
  search:{maxResults:6,defaultSources:["ytmsearch","ytsearch"]},
  player:{defaultVolume:100,seekStep:10000,maxHistorySize:50,stay247:{reconnectDelay:5000,maxReconnectAttempts:10,checkInterval:30000},audioQuality:{bitrate:320,sampleRate:48000,channels:2,bufferSize:8192,highWaterMark:1048576}},
  watermark:"LightCore",
  version:"5.0.0"
};
