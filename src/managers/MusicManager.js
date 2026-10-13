import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { LavalinkManager } from "lavalink-client";
import fs from "fs-extra";
import path from "node:path";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { loadNeonJsonSnapshot } from "#database/neon/snapshots";
import { neonQuery } from "#database/neon/connection";

const SETTINGS_FILE = path.resolve("database/data/music-settings.json");
const DEFAULTS = {
  defaultVolume: config.music.defaultVolume,
  maxQueue: config.music.maxQueue,
  djRoleId: null,
  announceNowPlaying: true,
  defaultSource: "ytmsearch",
  autoplay: false,
  loop: "off"
};

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.settings = {};
    this.initialized = false;
    this.previousTracks = new Map();
    this.nodesConfig = [...(config.music.nodes || []), ...(config.music.node || [])];
    this.lavalink = this.nodesConfig.length ? new LavalinkManager({
      nodes: this.nodesConfig,
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
      autoSkip: true,
      client: { id: config.clientId, username: "LightCore" },
      playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: {
          destroyAfterMs: 60000,
          autoPlayFunction: async (player, lastPlayedTrack) => {
            const settings = this.getSettings(player.guildId);
            if (!settings.autoplay || !lastPlayedTrack?.info?.title) return;
            const info = lastPlayedTrack.info;
            const query = info.author ? info.author + " - " + info.title : info.title;
            const result = await player.search({ query, source: settings.defaultSource }, lastPlayedTrack.requester || "LightCore");
            const next = result?.tracks?.find(track => track.info?.identifier !== info.identifier);
            if (next) await player.queue.add(next);
          }
        }
      }
    }) : null;

    if (!this.lavalink) {
      logger.warn("Music", "No Lavalink node configured. Set LAVALINK_HOST/PORT/PASSWORD or LAVALINK_NODES.");
      return;
    }

    this.lavalink.on("trackStart", (player, track) => {
      this.announce(player, track).catch(error => logger.warn("Music", "Now-playing announcement failed:", error));
    });
    this.lavalink.on("trackEnd", (player, track) => {
      if (track) this.previousTracks.set(player.guildId, track);
    });
    this.lavalink.on("trackError", (player, track, payload) => {
      logger.error("Music", "Track failed in guild " + player.guildId + ": " + (track?.info?.title || "unknown"), payload);
      this.sendText(player, "⚠️ I couldn't play **" + this.escape(track?.info?.title || "that track") + "**. Try another result or check the Lavalink node and its source plugins.")
        .catch(() => {});
    });
    this.lavalink.on("queueEnd", player => {
      this.sendText(player, "✨ The queue has finished. I'll leave the voice channel in 60 seconds if no more tracks are added.")
        .catch(() => {});
    });
    this.lavalink.nodeManager.on("connect", node => logger.success("MusicNode", "Connected to Lavalink node: " + node.id));
    this.lavalink.nodeManager.on("disconnect", (node, reason) => logger.warn("MusicNode", "Node " + node.id + " disconnected: " + (reason?.reason || reason || "unknown")));
    this.lavalink.nodeManager.on("error", (node, error) => logger.error("MusicNode", "Node " + (node?.id || "unknown") + " error:", error));
  }

  async init() {
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    let localSettings = {};
    try { localSettings = await fs.readJson(SETTINGS_FILE); } catch {}
    await neonQuery("CREATE TABLE IF NOT EXISTS aerox_music_settings (guild_id TEXT PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const storedSettings = await loadNeonJsonSnapshot("music-settings", null);
    const legacySettings = storedSettings && typeof storedSettings === "object" && !Array.isArray(storedSettings)
      ? storedSettings
      : localSettings;
    // One-time compatibility import: existing per-guild settings are copied without
    // overwriting rows already migrated by another shard or deployment.
    for (const [guildId, guildSettings] of Object.entries(legacySettings || {})) {
      if (!guildId || !guildSettings || typeof guildSettings !== "object" || Array.isArray(guildSettings)) continue;
      await neonQuery(
        "INSERT INTO aerox_music_settings (guild_id, settings) VALUES ($1, $2::jsonb) ON CONFLICT (guild_id) DO NOTHING",
        [guildId, JSON.stringify(guildSettings)]
      );
    }
    const result = await neonQuery("SELECT guild_id, settings FROM aerox_music_settings");
    this.settings = Object.fromEntries(result.rows.map(row => [row.guild_id, row.settings]));
    await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });

    if (!config.music.enabled) {
      logger.warn("Music", "Music is disabled by MUSIC_ENABLED=false.");
      return;
    }
    if (!this.lavalink) {
      logger.warn("Music", "Music cannot start: no Lavalink node is configured.");
      return;
    }

    await this.lavalink.init({ id: this.client.user.id, username: this.client.user.username });
    this.initialized = true;
    logger.success("Music", "Music manager initialized with " + this.nodesConfig.length + " configured Lavalink node(s).");
  }

  sendRawData(data) {
    if (!config.music.enabled || !this.lavalink) return;
    try { void this.lavalink.sendRawData(data); }
    catch (error) { logger.warn("Music", "Failed to forward Discord voice packet:", error); }
  }

  getPlayer(guildId) { return this.lavalink?.getPlayer(guildId) || null; }

  getSettings(guildId) {
    return { ...DEFAULTS, ...(this.settings[guildId] || {}) };
  }

  async updateSettings(guildId, patch) {
    if (!guildId) throw new Error("A guild ID is required to save music settings.");
    // Merge only the changed keys in PostgreSQL so concurrent shards cannot
    // overwrite unrelated settings for this or other guilds.
    const result = await neonQuery(
      "INSERT INTO aerox_music_settings (guild_id, settings, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (guild_id) DO UPDATE SET settings = aerox_music_settings.settings || EXCLUDED.settings, updated_at = NOW() RETURNING settings",
      [guildId, JSON.stringify(patch)]
    );
    this.settings = { ...this.settings, [guildId]: result.rows[0]?.settings || { ...this.getSettings(guildId), ...patch } };
    await fs.ensureDir(path.dirname(SETTINGS_FILE));
    await fs.writeJson(SETTINGS_FILE, this.settings, { spaces: 2 });
    return this.getSettings(guildId);
  }

  trackControls(player) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aerox_track:previous").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:toggle").setEmoji(player?.paused ? "▶️" : "⏸️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("aerox_track:skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("aerox_track:queue").setEmoji("📜").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aerox_track:vol_down").setLabel("− Volume").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:vol_up").setLabel("+ Volume").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:loop").setLabel("Loop: " + this.getSettings(player.guildId).loop).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:shuffle").setLabel("Shuffle").setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  trackEmbed(player, track) {
    const info = track?.info || {};
    const url = /^https?:\/\//i.test(String(info.uri || "")) ? info.uri : null;
    const total = Math.max(0, Number(info.duration || 0));
    const position = Math.min(total || Number.MAX_SAFE_INTEGER, Math.max(0, Number(player?.position || 0)));
    const marker = total ? Math.min(13, Math.floor((position / total) * 13)) : 0;
    const progressBar = Array.from({ length: 14 }, (_, index) => index === marker ? "🔘" : "▬").join("");
    const progress = info.isStream
      ? "🔴 **LIVE STREAM**"
      : total
        ? progressBar + "\n`" + this.formatDuration(position) + " / " + this.formatDuration(total) + "`"
        : "Duration unavailable";
    const title = this.escape(info.title || "Unknown track");
    const embed = new EmbedBuilder().setColor(0x5865F2)
      .setAuthor({ name: "🎧 LIGHTCORE • NOW PLAYING", iconURL: this.client.user.displayAvatarURL() })
      .setDescription((url ? "[" + title + "](" + url + ")" : "**" + title + "**") + "\n\n" + progress)
      .addFields(
        { name: "🎤 Artist", value: this.escape(info.author || "Unknown artist"), inline: true },
        { name: "⏱️ Duration", value: info.isStream ? "LIVE" : this.formatDuration(total), inline: true },
        { name: "🙋 Requested by", value: this.escape(track?.requester?.username || track?.requester?.tag || "A listener"), inline: true },
        { name: "🔊 Volume", value: String(player?.volume ?? this.getSettings(player.guildId).defaultVolume) + "%", inline: true },
        { name: "📜 Queue", value: String(player?.queue?.tracks?.length || 0) + " upcoming", inline: true },
        { name: "🔁 Repeat", value: this.getSettings(player.guildId).loop, inline: true }
      )
      .setFooter({ text: "LightCore Music • Use the controls below to manage playback" })
      .setTimestamp();
    if (info.artworkUrl && /^https?:\/\//i.test(info.artworkUrl)) embed.setThumbnail(info.artworkUrl);
    return embed;
  }

  async announce(player, track) {
    if (!this.getSettings(player.guildId).announceNowPlaying) return;
    const channel = player.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (!channel?.isTextBased()) return;
    const sent = await channel.send({ embeds: [this.trackEmbed(player, track)], components: this.trackControls(player) });
    const collector = sent.createMessageComponentCollector({ time: Math.max(60_000, Number(track?.info?.duration || 0) || 10 * 60_000) });
    collector.on("collect", async interaction => {
      const fresh = this.getPlayer(player.guildId);
      if (!fresh) return interaction.reply({ content: "The music session has ended. Start a new track to use its controls.", ephemeral: true }).catch(() => {});
      const guild = interaction.guild;
      const actor = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
      if (!actor) return interaction.reply({ content: "I could not verify your server membership.", ephemeral: true }).catch(() => {});
      const voice = actor.voice.channel;
      if (!voice) return interaction.reply({ content: "Join a voice channel first to control playback.", ephemeral: true }).catch(() => {});
      if (fresh.voiceChannelId && fresh.voiceChannelId !== voice.id) return interaction.reply({ content: "Join the same voice channel as LightCore to control playback.", ephemeral: true }).catch(() => {});
      const settings = this.getSettings(player.guildId);
      if (!actor.permissions.has(PermissionFlagsBits.ManageGuild) && settings.djRoleId && !actor.roles.cache.has(settings.djRoleId)) {
        return interaction.reply({ content: "You need the configured DJ role <@&" + settings.djRoleId + "> to control music.", ephemeral: true }).catch(() => {});
      }
      const action = interaction.customId.split(":").at(-1);
      try {
        if (action === "toggle") fresh.paused ? await fresh.resume() : await fresh.pause();
        else if (action === "skip") await fresh.skip();
        else if (action === "previous") {
          const previous = this.previousTracks.get(player.guildId);
          if (!previous) return interaction.reply({ content: "There is no previous track in this session.", ephemeral: true }).catch(() => {});
          fresh.queue.tracks.unshift(previous);
          if (fresh.playing) await fresh.skip();
        } else if (action === "stop") {
          await this.lavalink.destroyPlayer(player.guildId, "track-panel-stop");
          collector.stop("stopped");
          return interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("⏹️ Playback stopped").setDescription("LightCore has stopped playback.")], components: [] });
        } else if (action === "queue") {
          const list = fresh.queue?.tracks || [];
          const lines = list.slice(0, 15).map((item, index) => "**" + (index + 1) + ".** " + this.escape(item.info?.title || "Unknown track") + " · " + this.formatDuration(item.info?.duration));
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("📜 LightCore Queue").setDescription(lines.join("\n") || "No upcoming tracks.")], ephemeral: true });
        } else if (action === "vol_down" || action === "vol_up") {
          await fresh.setVolume(Math.max(0, Math.min(100, Number(fresh.volume ?? settings.defaultVolume) + (action === "vol_up" ? 10 : -10))));
        } else if (action === "loop") {
          const next = settings.loop === "off" ? "track" : settings.loop === "track" ? "queue" : "off";
          await this.updateSettings(player.guildId, { loop: next });
          if (typeof fresh.setRepeatMode === "function") await fresh.setRepeatMode(next);
        } else if (action === "shuffle") {
          if ((fresh.queue?.tracks?.length || 0) < 2) return interaction.reply({ content: "Add at least two upcoming tracks before shuffling.", ephemeral: true }).catch(() => {});
          await fresh.queue.shuffle();
        }
        const current = fresh.queue?.current || track;
        await interaction.update({ embeds: [this.trackEmbed(fresh, current)], components: this.trackControls(fresh) });
      } catch (error) {
        logger.warn("Music", "Track panel action failed:", error);
        await interaction.reply({ content: "That control failed. Please try again.", ephemeral: true }).catch(() => {});
      }
    });
    collector.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  }

  async sendText(player, content) {
    const channel = player?.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (channel?.isTextBased()) return channel.send({ content });
  }

  formatDuration(ms = 0) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") : minutes + ":" + String(seconds).padStart(2, "0");
  }

  escape(value = "") {
    return String(value).replace(/[\\*_~]/g, "").replace(/[\r\n]/g, " ").slice(0, 180);
  }
}
