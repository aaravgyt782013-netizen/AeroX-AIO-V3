import fs from "fs-extra";
import path from "node:path";
import { config } from "#config/config";
import { loadNeonJsonSnapshot } from "#database/neon/snapshots";
import { neonQuery } from "#database/neon/connection";

export const MUSIC_DEFAULTS = Object.freeze({
  defaultVolume: config.music.defaultVolume,
  maxQueue: config.music.maxQueue,
  djRoleId: null,
  announceNowPlaying: true,
  showRequester: true,
  showArtwork: true,
  announcementChannelId: null,
  requestChannelId: null,
  allowedVoiceChannelId: null,
  defaultSource: "ytmsearch",
  autoplay: false,
  stay247: false,
  stay247VoiceChannelId: null,
  stay247TextChannelId: null,
  loop: "off"
});

const SETTINGS_FILE = path.resolve("database/data/music-settings.json");
const TABLE = "aerox_music_settings";

export class MusicSettingsStore {
  constructor() {
    this.settings = {};
    this.initialized = false;
  }

  async init() {
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    let localSettings = {};
    try {
      localSettings = await fs.readJson(SETTINGS_FILE);
    } catch {
      // A missing/corrupt local cache is recoverable from Neon.
    }

    await neonQuery(
      "CREATE TABLE IF NOT EXISTS aerox_music_settings (guild_id TEXT PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );

    const snapshot = await loadNeonJsonSnapshot("music-settings", null);
    const legacySettings = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot
      : localSettings;

    // Import legacy data in one deterministic batch. Multiple Discord shards
    // initialize simultaneously, so per-row writes can deadlock on shared keys.
    const legacyRows = Object.entries(legacySettings || {})
      .filter(([guildId, guildSettings]) =>
        Boolean(guildId) &&
        guildSettings &&
        typeof guildSettings === "object" &&
        !Array.isArray(guildSettings)
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([guild_id, settings]) => ({ guild_id, settings }));

    if (legacyRows.length) {
      await this.retryDeadlock(() => neonQuery(
        "INSERT INTO aerox_music_settings (guild_id, settings) SELECT item.guild_id, item.settings FROM jsonb_to_recordset($1::jsonb) AS item(guild_id TEXT, settings JSONB) ON CONFLICT (guild_id) DO NOTHING",
        [JSON.stringify(legacyRows)]
      ));
    }

    const result = await neonQuery("SELECT guild_id, settings FROM aerox_music_settings");
    this.settings = Object.fromEntries(result.rows.map(row => [row.guild_id, row.settings || {}]));
    await this.writeLocalCache();
    this.initialized = true;
    return this.settings;
  }

  get(guildId) {
    return { ...MUSIC_DEFAULTS, ...(this.settings[guildId] || {}) };
  }

  async update(guildId, patch) {
    if (!guildId) throw new Error("A guild ID is required to save music settings.");
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new TypeError("Music settings updates must be an object.");
    }

    // Merge only the changed keys in SQL to avoid stale-shard overwrites.
    const result = await neonQuery(
      "INSERT INTO aerox_music_settings (guild_id, settings, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (guild_id) DO UPDATE SET settings = aerox_music_settings.settings || EXCLUDED.settings, updated_at = NOW() RETURNING settings",
      [guildId, JSON.stringify(patch)]
    );
    this.settings = {
      ...this.settings,
      [guildId]: result.rows[0]?.settings || { ...this.get(guildId), ...patch }
    };
    await this.writeLocalCache();
    return this.get(guildId);
  }

  async retryDeadlock(operation, attempt = 0) {
    try {
      return await operation();
    } catch (error) {
      const isDeadlock = error?.code === "40P01" || /deadlock detected/i.test(String(error?.message || ""));
      if (!isDeadlock || attempt >= 3) throw error;
      const delay = 180 * (attempt + 1) + Math.floor(Math.random() * 220);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryDeadlock(operation, attempt + 1);
    }
  }

  async writeLocalCache() {
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
  }
}
