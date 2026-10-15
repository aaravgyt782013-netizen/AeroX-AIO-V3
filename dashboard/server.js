import "dotenv/config";
import express from "express";
import session from "express-session";
import { neon } from "@neondatabase/serverless";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const required = ["SESSION_SECRET", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "DISCORD_BOT_TOKEN", "DATABASE_URL"];
const missing = required.filter((key) => !process.env[key]);
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
class NeonSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
  }
  async get(sid, callback) {
    try {
      const rows = await this.database`SELECT sess FROM dashboard_sessions WHERE sid = ${sid} AND expire > NOW() LIMIT 1`;
      callback(null, rows[0]?.sess || null);
    } catch (error) { callback(error); }
  }
  async set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 12 * 60 * 60 * 1000);
      await this.database`INSERT INTO dashboard_sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::jsonb, ${expires.toISOString()})
        ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`;
      callback(null);
    } catch (error) { callback(error); }
  }
  async destroy(sid, callback = () => {}) {
    try { await this.database`DELETE FROM dashboard_sessions WHERE sid = ${sid}`; callback(null); }
    catch (error) { callback(error); }
  }
  async touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 12 * 60 * 60 * 1000);
      await this.database`UPDATE dashboard_sessions SET expire = ${expires.toISOString()} WHERE sid = ${sid}`;
      callback(null);
    } catch (error) { callback(error); }
  }
}
const botGuildIds = new Set((process.env.BOT_GUILD_IDS || "").split(",").map((x) => x.trim()).filter(Boolean));
const premiumGuildIds = new Set((process.env.PREMIUM_GUILD_IDS || "").split(",").map((x) => x.trim()).filter(Boolean));
const premiumOnlyModules = new Set(["tickets"]);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
const schemaReady = sql ? ensureSchema() : Promise.resolve();
app.use(async (_req, res, next) => {
  try { await schemaReady; next(); }
  catch (error) {
    console.error("Database schema initialization failed:", error.message);
    res.status(503).send("Dashboard database is unavailable. Check DATABASE_URL and Neon.");
  }
});
app.use(session({
  store: sql ? new NeonSessionStore(sql) : undefined,
  name: "lightcore.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static(path.join(__dirname, "public")));

async function discord(pathname, options = {}) {
  const response = await fetch("https://discord.com/api/v10" + pathname, {
    ...options,
    headers: { Authorization: "Bot " + process.env.DISCORD_BOT_TOKEN, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error("Discord API returned " + response.status);
  return response.status === 204 ? null : response.json();
}
async function ensureSchema() {
  if (!sql) return;
  await sql`CREATE TABLE IF NOT EXISTS dashboard_sessions (
    sid TEXT PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMPTZ NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS dashboard_sessions_expire_idx ON dashboard_sessions (expire)`;
  await sql`CREATE TABLE IF NOT EXISTS dashboard_guild_settings (
    guild_id TEXT PRIMARY KEY,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Sign in with Discord to continue." });
  next();
}
function canManage(guild) {
  const perms = BigInt(guild.permissions || "0");
  return (perms & 0x20n) === 0x20n || (perms & 0x8n) === 0x8n || guild.owner === true;
}
function safeGuild(g) {
  return { id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, configured: missing.length === 0, missing }));
app.get("/auth/login", (req, res) => {
  if (missing.length) return res.status(503).send("Dashboard setup is incomplete. Configure environment variables listed in dashboard/.env.example.");
  const state = randomBytes(24).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: process.env.DISCORD_REDIRECT_URI, response_type: "code", scope: "identify guilds", state, prompt: "consent" });
  res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
});
app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send("Discord login was cancelled.");
    if (!code || !state || !req.session.oauthState || state !== req.session.oauthState) return res.status(400).send("Invalid OAuth state. Please sign in again.");
    delete req.session.oauthState;
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code: String(code), redirect_uri: process.env.DISCORD_REDIRECT_URI })
    });
    if (!tokenResponse.ok) throw new Error("Discord OAuth token exchange failed");
    const token = await tokenResponse.json();
    const headers = { Authorization: "Bearer " + token.access_token };
    const [userResponse, guildResponse] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", { headers }),
      fetch("https://discord.com/api/v10/users/@me/guilds", { headers })
    ]);
    if (!userResponse.ok || !guildResponse.ok) throw new Error("Could not retrieve Discord profile");
    const user = await userResponse.json();
    const guilds = await guildResponse.json();
    req.session.user = { id: user.id, username: user.global_name || user.username, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null };
    req.session.guilds = guilds.filter(canManage).map(safeGuild);
    req.session.guildAccess = guilds.filter(canManage).map((g) => g.id);
    res.redirect("/");
  } catch (err) {
    console.error("OAuth callback:", err.message);
    res.status(500).send("Discord login failed. Check OAuth credentials and redirect URI, then try again.");
  }
});
app.post("/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));
app.get("/api/guilds", requireAuth, async (req, res) => {
  const guilds = req.session.guilds || [];
  const filtered = [];
  for (const guild of guilds) {
    try {
      const botGuild = await discord("/guilds/" + guild.id);
      if (botGuild && (!botGuildIds.size || botGuildIds.has(guild.id))) filtered.push(guild);
    } catch {}
  }
  res.json({ guilds: filtered.map((g) => ({ ...g, premium: premiumGuildIds.has(g.id) })), botGuildIdsConfigured: botGuildIds.size > 0 });
});
app.get("/api/guilds/:id/settings", requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!(req.session.guildAccess || []).includes(id)) return res.status(403).json({ error: "You do not have Manage Server permission for this server." });
  try {
    await discord("/guilds/" + id);
    const rows = await sql`SELECT settings FROM dashboard_guild_settings WHERE guild_id = ${id} LIMIT 1`;
    res.json({ settings: rows[0]?.settings || {} });
  } catch (err) {
    console.error("Read settings:", err.message);
    res.status(503).json({ error: "Could not load settings. Check bot access and Neon database configuration." });
  }
});
app.put("/api/guilds/:id/settings", requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!(req.session.guildAccess || []).includes(id)) return res.status(403).json({ error: "You do not have Manage Server permission for this server." });
  const allowed = ["welcome", "leveling", "logging", "tickets", "moderation"];
  const input = req.body?.settings;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !allowed.includes(k))) return res.status(400).json({ error: "Invalid settings payload." });
  const isPremium = premiumGuildIds.has(id);
  if (!isPremium && Object.keys(input).some((key) => premiumOnlyModules.has(key) && input[key]?.enabled)) {
    return res.status(402).json({ error: "Tickets is a Premium module for this server. Upgrade this guild to unlock it." });
  }
  if (!isPremium && input.moderation && ["antiSpam", "antiLinks", "antiInvites"].some((key) => input.moderation[key])) {
    return res.status(402).json({ error: "Advanced AutoMod options are Premium for this server. Disable them or upgrade this guild." });
  }
  const json = JSON.stringify(input);
  if (json.length > 20000) return res.status(413).json({ error: "Settings payload is too large." });
  try {
    await discord("/guilds/" + id);
    await sql`INSERT INTO dashboard_guild_settings (guild_id, settings, updated_by, updated_at)
      VALUES (${id}, ${json}::jsonb, ${req.session.user.id}, NOW())
      ON CONFLICT (guild_id) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
    res.json({ ok: true, savedAt: new Date().toISOString(), note: "Saved to Neon. Bot feature integration is required before these values change live Discord behavior." });
  } catch (err) {
    console.error("Save settings:", err.message);
    res.status(503).json({ error: "Settings could not be saved. Verify DATABASE_URL and Neon access." });
  }
});
app.get("/{*path}", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

if (missing.length) console.warn("Dashboard environment not fully configured:", missing.join(", "));
app.listen(port, () => console.log(`LightCore dashboard listening on :${port}`));
