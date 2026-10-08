import { Database } from "#structures/classes/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export class Guild extends Database {
  constructor() {
    super(config.database.guild);
    this._schemaFlags = {
      role: false,
      logging: false,
      tempvoice: false,
      honeypot: false,
      music: false,
      reactionroles: false,
    };
    this.initTable();
    this.initRoleSettings();
    this.initLoggingSettings();
    this.initMusicSettings();
    this.initReactionRoleSettings();
  }

  _ensureGuildColumns(flag, columns) {
    if (this._schemaFlags?.[flag]) return;
    const existing = new Set(
      this.all("PRAGMA table_info(guilds)").map(column => column.name)
    );
    for (const [name, definition] of columns) {
      if (existing.has(name)) continue;
      try {
        this.exec("ALTER TABLE guilds ADD COLUMN " + name + " " + definition);
        existing.add(name);
      } catch (error) {
        logger.warn("[GuildDB] Could not add guild column " + name + ": " + (error?.message || error));
      }
    }
    if (this._schemaFlags) this._schemaFlags[flag] = true;
  }

  initTable() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        prefixes TEXT,
        default_volume INTEGER DEFAULT 100,
        blacklisted BOOLEAN DEFAULT FALSE,
        blacklist_reason TEXT DEFAULT NULL,
        auto_disconnect BOOLEAN DEFAULT TRUE,
        stay_247 BOOLEAN DEFAULT FALSE,
        stay_247_voice_channel TEXT DEFAULT NULL,
        stay_247_text_channel TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }


  initRoleSettings() {
    this._ensureGuildColumns("role", [
      ["autorole_id", "TEXT DEFAULT NULL"],
    ]);
  }

  getAutorole(guildId) {
    this.ensureGuild(guildId); this.initRoleSettings();
    return this.getGuild(guildId)?.autorole_id || null;
  }

  setAutorole(guildId, roleId = null) {
    this.ensureGuild(guildId); this.initRoleSettings();
    return this.exec("UPDATE guilds SET autorole_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [roleId, guildId]);
  }


  initLoggingSettings() {
    this._ensureGuildColumns("logging", [
      ["logging_channels", "TEXT DEFAULT '{}'"],
      ["logging_enabled", "BOOLEAN DEFAULT FALSE"],
    ]);
  }

  getLogging(guildId) {
    this.ensureGuild(guildId); this.initLoggingSettings();
    const g = this.getGuild(guildId);
    let channels = {};
    try { channels = JSON.parse(g?.logging_channels || "{}"); } catch {}
    return { enabled: g?.logging_enabled === 1 || g?.logging_enabled === true, channels };
  }

  setLogging(guildId, channels, enabled = true) {
    this.ensureGuild(guildId); this.initLoggingSettings();
    return this.exec("UPDATE guilds SET logging_channels = ?, logging_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(channels || {}), enabled ? 1 : 0, guildId]);
  }

  updateLoggingChannel(guildId, type, channelId) {
    const current = this.getLogging(guildId);
    current.channels[type] = channelId;
    return this.setLogging(guildId, current.channels, true);
  }

  disableLogging(guildId) {
    this.ensureGuild(guildId); this.initLoggingSettings();
    return this.exec("UPDATE guilds SET logging_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [guildId]);
  }

  getGuild(guildId) {

    if (!guildId) return null;
    return this.get("SELECT * FROM guilds WHERE id   =?", [guildId]);
  }

  ensureGuild(guildId) {

    if (!guildId) {
      const errorMessage   =`[GuildDB] A valid guildId must be provided to ensureGuild. Received: ${guildId}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    let guild   =this.getGuild(guildId);
    const defaultPrefix   =JSON.stringify([config.prefix]);

    if (!guild) {

      this.exec("INSERT INTO guilds (id, prefixes, default_volume, auto_disconnect, stay_247, stay_247_voice_channel, stay_247_text_channel) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        [guildId, defaultPrefix, 100, 1, 0, null, null]);
      return this.getGuild(guildId);
    }


    let needsUpdate   =false;
    const updates   ={};

    if (!guild.prefixes) {
      updates.prefixes   =defaultPrefix;
      needsUpdate   =true;
    }

    if (guild.default_volume   ===null || guild.default_volume   ===undefined) {
      updates.default_volume   =100;
      needsUpdate   =true;
    }

    if (guild.auto_disconnect   ===null || guild.auto_disconnect   ===undefined) {
      updates.auto_disconnect   =1;
      needsUpdate   =true;
    }

    if (guild.stay_247   ===null || guild.stay_247   ===undefined) {
      updates.stay_247   =0;
      needsUpdate   =true;
    }

    if (needsUpdate) {
      const keys   =Object.keys(updates);
      const setClause   =keys.map(key   => `${key}   =?`).join(", ");
      const values   =keys.map(key   => updates[key]);
      values.push(guildId);

      this.exec(`UPDATE guilds SET ${setClause}, updated_at   =CURRENT_TIMESTAMP WHERE id   =?`, values);
      guild   =this.getGuild(guildId);
    }

    return guild;
  }

  getPrefixes(guildId) {
    const guild   =this.ensureGuild(guildId);
    try {
      const prefixes   =JSON.parse(guild.prefixes);
      return Array.isArray(prefixes) && prefixes.length > 0 ? prefixes : [config.prefix];
    } catch (e) {
      return [config.prefix];
    }
  }

  setPrefixes(guildId, prefixes) {
    this.ensureGuild(guildId);
    const prefixesJson   =JSON.stringify(prefixes);
    return this.exec(
      "UPDATE guilds SET prefixes   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [prefixesJson, guildId]
    );
  }

  getDefaultVolume(guildId) {
    const guild   =this.ensureGuild(guildId);
    return guild.default_volume || 100;
  }

  setDefaultVolume(guildId, volume) {
    this.ensureGuild(guildId);

    if (volume < 1 || volume > 100) {
      throw new Error("Volume must be between 1 and 100");
    }

    return this.exec(
      "UPDATE guilds SET default_volume   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [volume, guildId]
    );
  }

  getAllGuilds() {
    return this.all("SELECT * FROM guilds");
  }

  updateSettings(guildId, settings) {
    this.ensureGuild(guildId);
    const allowedKeys   =["prefixes", "default_volume", "auto_disconnect", "stay_247", "stay_247_voice_channel", "stay_247_text_channel"];
    const keys   =Object.keys(settings).filter(key   => allowedKeys.includes(key));

    if (keys.length   ===0) return null;

    const setClause   =keys.map((key)   => `${key}   =?`).join(", ");
    const values   =keys.map((key)   => settings[key]);
    values.push(guildId);

    return this.exec(
      `UPDATE guilds SET ${setClause}, updated_at   =CURRENT_TIMESTAMP WHERE id   =?`,
      values
    );
  }

  blacklistGuild(guildId, reason   ="No reason provided") {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET blacklisted   =1, blacklist_reason   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [reason, guildId]
    );
  }

  unblacklistGuild(guildId) {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET blacklisted   =0, blacklist_reason   =NULL, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [guildId]
    );
  }

  isBlacklisted(guildId) {
    const guild   =this.getGuild(guildId);
    if (!guild || !guild.blacklisted) return false;

    return {
      blacklisted: true,
      reason: guild.blacklist_reason || "No reason provided",
    };
  }

  getAllBlacklistedGuilds() {
    return this.all("SELECT * FROM guilds WHERE blacklisted   =1");
  }

  get247Settings(guildId) {
    const guild   =this.ensureGuild(guildId);
    return {
      enabled: guild.stay_247   ===1 || guild.stay_247   ===true,
      voiceChannel: guild.stay_247_voice_channel,
      textChannel: guild.stay_247_text_channel,
      autoDisconnect: guild.auto_disconnect   !==0 && guild.auto_disconnect   !==false
    };
  }

  set247Mode(guildId, enabled, voiceChannelId   =null, textChannelId   =null) {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET stay_247   =?, stay_247_voice_channel   =?, stay_247_text_channel   =?, auto_disconnect   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [
        enabled ? 1 : 0, 
        enabled ? voiceChannelId : null, 
        enabled ? textChannelId : null, 
        enabled ? 0 : 1, 
        guildId
      ]
    );
  }

  getAll247Guilds() {
    return this.all("SELECT * FROM guilds WHERE stay_247   =1 AND stay_247_voice_channel IS NOT NULL");
  }

  initTempVoiceTables() {
    this._ensureGuildColumns("tempvoice", [
      ["tempvoice_join_channel", "TEXT DEFAULT NULL"],
      ["tempvoice_category", "TEXT DEFAULT NULL"],
      ["tempvoice_name", "TEXT DEFAULT '🔊 {username}''s Room'"],
      ["tempvoice_limit", "INTEGER DEFAULT 0"],
      ["tempvoice_bitrate", "INTEGER DEFAULT 64000"],
      ["tempvoice_auto_delete", "BOOLEAN DEFAULT TRUE"],
      ["tempvoice_claim", "BOOLEAN DEFAULT TRUE"],
    ]);
    this.exec(`CREATE TABLE IF NOT EXISTS tempvoice_channels (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  getTempVoiceSettings(guildId) {
    this.ensureGuild(guildId);
    this.initTempVoiceTables();
    const g = this.getGuild(guildId);
    return {
      joinChannel: g.tempvoice_join_channel || null,
      category: g.tempvoice_category || null,
      name: g.tempvoice_name || "🔊 {username}'s Room",
      limit: Number(g.tempvoice_limit || 0),
      bitrate: Number(g.tempvoice_bitrate || 64000),
      autoDelete: g.tempvoice_auto_delete !== 0 && g.tempvoice_auto_delete !== false,
      claim: g.tempvoice_claim !== 0 && g.tempvoice_claim !== false,
    };
  }

  setTempVoiceSettings(guildId, settings = {}) {
    this.ensureGuild(guildId);
    this.initTempVoiceTables();
    const allowed = {
      joinChannel:"tempvoice_join_channel", category:"tempvoice_category",
      name:"tempvoice_name", limit:"tempvoice_limit", bitrate:"tempvoice_bitrate",
      autoDelete:"tempvoice_auto_delete", claim:"tempvoice_claim"
    };
    const entries = Object.entries(settings)
      .filter(([k]) => allowed[k])
      .map(([k,v]) => [allowed[k], v]);
    if (!entries.length) return null;
    const set = entries.map(([k]) => k + " = ?").join(", ");
    const values = entries.map(([,v]) => typeof v === "boolean" ? (v ? 1 : 0) : v);
    values.push(guildId);
    return this.exec("UPDATE guilds SET " + set + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?", values);
  }

  getTempVoiceChannel(channelId) {
    this.initTempVoiceTables();
    return this.get("SELECT * FROM tempvoice_channels WHERE channel_id = ?", [channelId]);
  }

  getTempVoiceChannels(guildId) {
    this.initTempVoiceTables();
    return this.all("SELECT * FROM tempvoice_channels WHERE guild_id = ?", [guildId]);
  }

  setTempVoiceChannel(channelId, guildId, ownerId) {
    this.initTempVoiceTables();
    return this.exec("INSERT OR REPLACE INTO tempvoice_channels (channel_id, guild_id, owner_id) VALUES (?, ?, ?)", [channelId, guildId, ownerId]);
  }

  setTempVoiceOwner(channelId, ownerId) {
    this.initTempVoiceTables();
    return this.exec("UPDATE tempvoice_channels SET owner_id = ? WHERE channel_id = ?", [ownerId, channelId]);
  }

  deleteTempVoiceChannel(channelId) {
    this.initTempVoiceTables();
    return this.exec("DELETE FROM tempvoice_channels WHERE channel_id = ?", [channelId]);
  }

  // ─── Honeypot security ──────────────────────────────────────────────────────
  initHoneypotSettings() {
    this._ensureGuildColumns("honeypot", [
      ["honeypot_channel", "TEXT DEFAULT NULL"],
      ["honeypot_action", "TEXT DEFAULT 'ban'"],
    ]);
  }

  getHoneypotSettings(guildId) {
    this.ensureGuild(guildId);
    this.initHoneypotSettings();
    const guild = this.getGuild(guildId);
    return {
      channelId: guild?.honeypot_channel || null,
      action: ["ban", "kick", "timeout"].includes(guild?.honeypot_action)
        ? guild.honeypot_action
        : "ban",
    };
  }

  setHoneypot(guildId, channelId, action = "ban") {
    this.ensureGuild(guildId);
    this.initHoneypotSettings();
    const safeAction = ["ban", "kick", "timeout"].includes(action) ? action : "ban";
    return this.exec(
      "UPDATE guilds SET honeypot_channel = ?, honeypot_action = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [channelId || null, safeAction, guildId],
    );
  }

  setHoneypotAction(guildId, action) {
    const current = this.getHoneypotSettings(guildId);
    return this.setHoneypot(guildId, current.channelId, action);
  }

  initReactionRoleSettings() {
    this._ensureGuildColumns("reactionroles", [
      ["reaction_roles", "TEXT DEFAULT '{}'"],
    ]);
  }

  getReactionRoles(guildId) {
    this.ensureGuild(guildId);
    this.initReactionRoleSettings();
    const guild = this.getGuild(guildId);
    try {
      const parsed = JSON.parse(guild?.reaction_roles || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  setReactionRole(guildId, messageId, emojiKey, roleId, channelId = null) {
    const data = this.getReactionRoles(guildId);
    const entry = data[messageId] || { channelId: null, roles: {} };
    entry.channelId = channelId || entry.channelId || null;
    entry.roles = entry.roles || {};
    entry.roles[emojiKey] = roleId;
    data[messageId] = entry;
    return this.exec("UPDATE guilds SET reaction_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(data), guildId]);
  }

  removeReactionRole(guildId, messageId, emojiKey) {
    const data = this.getReactionRoles(guildId);
    if (!data[messageId]) return false;
    delete data[messageId].roles?.[emojiKey];
    if (!data[messageId].roles || Object.keys(data[messageId].roles).length === 0) delete data[messageId];
    this.exec("UPDATE guilds SET reaction_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(data), guildId]);
    return true;
  }

  clearReactionRoles(guildId, messageId) {
    const data = this.getReactionRoles(guildId);
    const existed = Boolean(data[messageId]);
    delete data[messageId];
    this.exec("UPDATE guilds SET reaction_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(data), guildId]);
    return existed;
  }

  initMusicSettings() {
    this._ensureGuildColumns("music", [
      ["dj_role", "TEXT DEFAULT NULL"],
      ["autoplay", "BOOLEAN DEFAULT FALSE"],
      ["announce_songs", "BOOLEAN DEFAULT TRUE"],
      ["vote_skip", "BOOLEAN DEFAULT FALSE"],
      ["request_channel", "TEXT DEFAULT NULL"],
      ["music_source", "TEXT DEFAULT 'ytmsearch'"],
      ["music_247", "BOOLEAN DEFAULT FALSE"],
    ]);
  }

  getMusicSettings(guildId) {
    const guild = this.ensureGuild(guildId);
    return {
      djRole: guild.dj_role || null,
      autoplay: !!guild.autoplay,
      announceSongs: guild.announce_songs !== 0 && guild.announce_songs !== false,
      voteSkip: !!guild.vote_skip,
      requestChannel: guild.request_channel || null,
      source: guild.music_source || "ytmsearch",
      mode247: !!guild.music_247
    };
  }

  setMusicSettings(guildId, settings = {}) {
    this.ensureGuild(guildId);
    const allowed = { djRole:"dj_role", autoplay:"autoplay", announceSongs:"announce_songs", voteSkip:"vote_skip", requestChannel:"request_channel", source:"music_source", mode247:"music_247" };
    const entries = Object.entries(settings).filter(([k]) => allowed[k]).map(([k,v]) => [allowed[k],v]);
    if (!entries.length) return null;
    const set = entries.map(([k]) => k + " = ?").join(", ");
    const values = entries.map(([,v]) => v === true ? 1 : v === false ? 0 : v);
    values.push(guildId);
    return this.exec("UPDATE guilds SET " + set + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?", values);
  }

  setDJRole(guildId, roleId = null) { return this.setMusicSettings(guildId, { djRole: roleId }); }
  setAutoplay(guildId, enabled) { return this.setMusicSettings(guildId, { autoplay: !!enabled }); }
  setVoteSkip(guildId, enabled) { return this.setMusicSettings(guildId, { voteSkip: !!enabled }); }
  setAnnounceSongs(guildId, enabled) { return this.setMusicSettings(guildId, { announceSongs: !!enabled }); }

  setAutoDisconnect(guildId, enabled) {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET auto_disconnect   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [enabled ? 1 : 0, guildId]
    );
  }

  getValid247Guilds() {
    const guilds   =this.all(`
      SELECT * FROM guilds 
      WHERE stay_247   =1 
      AND stay_247_voice_channel IS NOT NULL 
      AND stay_247_voice_channel   !=''
    `);

    return guilds.filter(guild   => {
      return guild.stay_247_voice_channel && guild.stay_247_voice_channel.length > 0;
    });
  }
}
