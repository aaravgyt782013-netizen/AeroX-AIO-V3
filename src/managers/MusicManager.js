import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, ThumbnailBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits } from "discord.js";
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
};

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.settings = {};
    this.initialized = false;
    this.previousTracks = new Map();
    // Keep one live player panel per guild; update it as tracks change instead of
    // spamming a new panel for every song or letting controls expire mid-session.
    this.trackPanels = new Map();
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
            let result = null;
            for (const source of [...new Set([settings.defaultSource, "ytmsearch", "ytsearch", "scsearch"].filter(Boolean))]) {
              try {
                result = await player.search({ query, source }, lastPlayedTrack.requester || "LightCore");
                if (result?.tracks?.length) break;
              } catch (error) {
                logger.debug("Music", "Autoplay source " + source + " failed; trying the next source:", error);
              }
            }
            const next = result?.tracks?.find(track => track.info?.identifier !== info.identifier);
            if (next) await player.queue.add(next);
          }
        }
      }
    }) : null;

    if (!this.lavalink) {
      logger.warn("Music", "No Lavalink node configured. Set LAVALINK_PASSWORD (shared) or LAVALINK_NODE_1_PASSWORD and LAVALINK_NODE_2_PASSWORD, or configure LAVALINK_NODES.");
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
      this.sendText(player, "⚠️ **LightCore couldn't play that track.** Trying the next queued track automatically when available.")
        .catch(() => {});
      // A failed source/track should not strand the queue. Skip only if this failed
      // track is still current, so a late error cannot skip a healthy next track.
      setTimeout(async () => {
        try {
          const active = this.getPlayer(player.guildId);
          const current = active?.queue?.current;
          const sameTrack = current && (current.encoded === track?.encoded || current.info?.identifier === track?.info?.identifier);
          if (active && sameTrack && (active.queue?.tracks?.length || 0) > 0) await active.skip();
        } catch (error) {
          logger.warn("Music", "Automatic recovery skip failed:", error);
        }
      }, 1200);
    });
    this.lavalink.on("queueEnd", player => {
      this.sendText(player, "✨ The queue has finished. I'll leave the voice channel in 60 seconds if no more tracks are added.")
        .catch(() => {});
    });
    this.lavalink.nodeManager.on("connect", node => {
      logger.success("MusicNode", "Connected to Lavalink node: " + node.id);
      try {
        // Preserve active Lavalink players across brief WebSocket interruptions.
        void Promise.resolve(node.updateSession(true, 300_000)).catch(error => logger.warn("MusicNode", "Session resuming could not be enabled for " + node.id + ":", error));
      } catch (error) {
        logger.warn("MusicNode", "Could not enable session resuming for " + node.id + ":", error);
      }
    });
    this.lavalink.nodeManager.on("resumed", (node, _payload, players) => {
      logger.success("MusicNode", "Resumed Lavalink session on " + node.id + " with " + (Array.isArray(players) ? players.length : 0) + " player(s).");
    });
    this.lavalink.nodeManager.on("reconnecting", node => logger.warn("MusicNode", "Reconnecting to Lavalink node: " + node.id));
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
    await this.ensure247Players();
    this.stay247Timer = setInterval(() => {
      this.ensure247Players().catch(error => logger.warn("Music", "24/7 voice keep-alive check failed:", error));
    }, 20000);
    this.stay247Timer.unref?.();
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

  async ensure247Players() {
    if (!this.initialized || !this.lavalink) return;
    for (const [guildId] of Object.entries(this.settings)) {
      const settings = this.getSettings(guildId);
      if (!settings.stay247 || !settings.stay247VoiceChannelId) continue;
      if (!this.client.guilds.cache.has(guildId)) continue;
      try {
        let player = this.getPlayer(guildId);
        if (player && player.voiceChannelId && player.voiceChannelId !== settings.stay247VoiceChannelId) {
          // Do not force-move a live session that a moderator has intentionally moved.
          continue;
        }
        if (!player) {
          player = this.lavalink.createPlayer({
            guildId,
            voiceChannelId: settings.stay247VoiceChannelId,
            textChannelId: settings.stay247TextChannelId || settings.requestChannelId || settings.announcementChannelId || undefined,
            selfDeaf: true,
            volume: settings.defaultVolume
          });
        }
        if (!player.connected) await player.connect();
      } catch (error) {
        logger.warn("Music", "Could not restore 24/7 voice session for guild " + guildId + ":", error);
      }
    }
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
    const settings = this.getSettings(player.guildId);
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aerox_track:previous").setLabel("Previous").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:toggle").setLabel(player?.paused ? "Resume" : "Pause").setEmoji(player?.paused ? "▶️" : "⏸️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("aerox_track:skip").setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:stop").setLabel("Stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("aerox_track:queue").setLabel("Queue").setEmoji("📜").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aerox_track:vol_down").setLabel("− 10").setEmoji("🔉").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:vol_up").setLabel("+ 10").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:loop").setLabel("Repeat · " + settings.loop).setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:shuffle").setLabel("Shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aerox_track:dashboard").setLabel("Full Control Panel").setEmoji("🎛️").setStyle(ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aerox_track:seek_back").setLabel("−10 sec").setEmoji("⏪").setStyle(ButtonStyle.Secondary).setDisabled(!player?.queue?.current || Boolean(player?.queue?.current?.info?.isStream)),
        new ButtonBuilder().setCustomId("aerox_track:seek_forward").setLabel("+10 sec").setEmoji("⏩").setStyle(ButtonStyle.Secondary).setDisabled(!player?.queue?.current || Boolean(player?.queue?.current?.info?.isStream))
      )
    ];
  }

  trackContainer(player, track) {
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
    const settings = this.getSettings(player.guildId);
    const artwork = settings.showArtwork ? (info.artworkUrl || info.thumbnail || info.image || null) : null;
    const playerSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "# ✦ LIGHTCORE • NOW PLAYING\n-# MUSIC FOR YOUR COMMUNITY\n" +
        (url ? "[" + title + "](" + url + ")" : "**" + title + "**") + "\n\n" + progress
      ));
    if (/^https?:\/\//i.test(String(artwork || ""))) {
      playerSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(artwork).setDescription("Album artwork for " + title));
    }
    const container = new ContainerBuilder().setAccentColor(0x5865F2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "# ✦ LIGHTCORE  /  MUSIC PLAYER\n-# NOW PLAYING • LIVE SERVER SESSION"
      ))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addSectionComponents(playerSection)
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([
        "### 🎚️ SESSION DETAILS",
        "**Artist**  ·  " + this.escape(info.author || "Unknown artist"),
        "**Length**  ·  " + (info.isStream ? "🔴 Live stream" : this.formatDuration(total)),
        ...(settings.showRequester ? ["**Requested by**  ·  " + this.escape(track?.requester?.username || track?.requester?.tag || "A listener")] : []),
        "**Volume**  ·  " + String(player?.volume ?? settings.defaultVolume) + "%",
        "**Queue**  ·  " + String(player?.queue?.tracks?.length || 0) + " upcoming",
        "**Repeat**  ·  " + settings.loop,
        "**Autoplay**  ·  " + (settings.autoplay ? "On" : "Off")
      ].join("\n")))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Use the controls below, or open the full LightCore control panel for server settings and advanced playback."));
    return container;
  }

  async announce(player, track) {
    const guildId = player.guildId;
    const settings = this.getSettings(guildId);
    let existing = this.trackPanels.get(guildId);
    const currentPlayer = this.getPlayer(guildId) || player;
    const currentTrack = currentPlayer.queue?.current || track;

    // Send one announcement per track, with a button that opens the live control panel.
    if (settings.announceNowPlaying) {
      const channelId = settings.announcementChannelId || player.textChannelId;
      const announcementChannel = channelId ? this.client.channels.cache.get(channelId) : null;
      if (announcementChannel?.isTextBased()) {
        try {
          const announcementRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("aerox_announcement:dashboard")
              .setLabel("Open Music Control Panel")
              .setEmoji("🎛️")
              .setStyle(ButtonStyle.Primary)
          );
          const announcement = await announcementChannel.send({
            components: [this.trackContainer(currentPlayer, track), announcementRow],
            flags: MessageFlags.IsComponentsV2
          });
          const announcementCollector = announcement.createMessageComponentCollector();
          announcementCollector.on("collect", async interaction => {
            if (interaction.customId !== "aerox_announcement:dashboard") return;
            const guild = interaction.guild;
            const actor = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
            if (!actor) return interaction.reply({ content: "I could not verify your server membership.", ephemeral: true }).catch(() => {});
            try {
              const { openMusicPanel } = await import("../commands/Music/panel.js");
              return await openMusicPanel({
                client: this.client,
                message: {
                  guild,
                  member: actor,
                  reply: options => interaction.reply({
                    ...options,
                    flags: (options.flags || 0) | MessageFlags.Ephemeral,
                    fetchReply: true
                  })
                }
              });
            } catch (error) {
              logger.warn("Music", "Could not open dashboard from a song announcement:", error);
              return interaction.reply({ content: "Could not open the music dashboard. Try `.musicpanel`.", ephemeral: true }).catch(() => {});
            }
          });
        } catch (error) {
          logger.warn("Music", "Could not post song announcement in channel " + channelId + ":", error);
        }
      } else {
        logger.warn("Music", "Song announcement channel is unavailable for guild " + guildId + ".");
      }
    }

    const components = [this.trackContainer(currentPlayer, currentTrack), ...this.trackControls(currentPlayer)];

    // A process restart clears the in-memory map. Remove the saved stale player panel
    // before creating a fresh one, so users do not keep seeing a dead/old control message.
    if (!existing) {
      const savedChannelId = settings.trackPanelChannelId;
      const savedMessageId = settings.trackPanelMessageId;
      if (savedChannelId && savedMessageId) {
        try {
          const savedChannel = this.client.channels.cache.get(savedChannelId) || await this.client.channels.fetch(savedChannelId);
          const savedMessage = savedChannel?.isTextBased() && savedChannel.messages
            ? await savedChannel.messages.fetch(savedMessageId).catch(() => null)
            : null;
          if (savedMessage) await savedMessage.delete().catch(() => {});
        } catch (error) {
          logger.warn("Music", "Could not remove the previous process's stale player panel:", error);
        }
        await this.updateSettings(guildId, { trackPanelChannelId: null, trackPanelMessageId: null }).catch(error => logger.warn("Music", "Could not clear stale player-panel metadata:", error));
      }
    }

    if (existing?.message && !existing.message.deleted) {
      try {
        await existing.message.edit({ components });
        return;
      } catch (error) {
        logger.warn("Music", "Could not refresh the existing player panel; sending a replacement:", error);
        existing.collector?.stop("panel-refresh-failed");
        this.trackPanels.delete(guildId);
      }
    }

    const channel = player.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (!channel?.isTextBased()) {
      logger.warn("Music", "Cannot post player panel: playback text channel is unavailable for guild " + guildId);
      return;
    }

    const sent = await channel.send({ components, flags: MessageFlags.IsComponentsV2 });
    const collector = sent.createMessageComponentCollector();
    this.trackPanels.set(guildId, { message: sent, collector, channelId: channel.id });
    await this.updateSettings(guildId, { trackPanelChannelId: channel.id, trackPanelMessageId: sent.id }).catch(error => logger.warn("Music", "Could not persist player-panel metadata:", error));

    collector.on("collect", async interaction => {
      if (!interaction.customId.startsWith("aerox_track:")) {
        return interaction.reply({ content: "This is not a LightCore music control.", ephemeral: true }).catch(() => {});
      }
      const fresh = this.getPlayer(guildId);
      if (!fresh) return interaction.reply({ content: "The music session has ended. Start a new track to use its controls.", ephemeral: true }).catch(() => {});
      const guild = interaction.guild;
      const actor = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
      if (!actor) return interaction.reply({ content: "I could not verify your server membership.", ephemeral: true }).catch(() => {});
      const action = interaction.customId.split(":").at(-1);
      const settings = this.getSettings(guildId);
      if (action !== "dashboard") {
        const voice = actor.voice.channel;
        if (!voice) return interaction.reply({ content: "Join a voice channel first to control playback.", ephemeral: true }).catch(() => {});
        if (fresh.voiceChannelId && fresh.voiceChannelId !== voice.id) return interaction.reply({ content: "Join the same voice channel as LightCore to control playback.", ephemeral: true }).catch(() => {});
        if (settings.allowedVoiceChannelId && voice.id !== settings.allowedVoiceChannelId) return interaction.reply({ content: "Music playback is restricted to <#" + settings.allowedVoiceChannelId + "> in this server.", ephemeral: true }).catch(() => {});
        if (!actor.permissions.has(PermissionFlagsBits.ManageGuild) && settings.djRoleId && !actor.roles.cache.has(settings.djRoleId)) {
          return interaction.reply({ content: "You need the configured DJ role <@&" + settings.djRoleId + "> to control music.", ephemeral: true }).catch(() => {});
        }
      }
      if (action === "dashboard") {
        try {
          const { openMusicPanel } = await import("../commands/Music/panel.js");
          return await openMusicPanel({
            client: this.client,
            message: {
              guild: interaction.guild,
              member: actor,
              reply: options => interaction.reply({
                ...options,
                flags: (options.flags || 0) | MessageFlags.Ephemeral,
                fetchReply: true
              })
            }
          });
        } catch (error) {
          logger.warn("Music", "Could not open the full music dashboard from the player panel:", error);
          return interaction.reply({ content: "Could not open the dashboard. Try `.musicpanel` in this server.", ephemeral: true }).catch(() => {});
        }
      }
      try {
        if (action === "toggle") fresh.paused ? await fresh.resume() : await fresh.pause();
        else if (action === "skip") await fresh.skip();
        else if (action === "previous") {
          const previous = this.previousTracks.get(guildId);
          if (!previous) return interaction.reply({ content: "There is no previous track in this session.", ephemeral: true }).catch(() => {});
          fresh.queue.tracks.unshift(previous);
          if (fresh.playing) await fresh.skip();
        } else if (action === "stop") {
          await this.lavalink.destroyPlayer(guildId, "track-panel-stop");
          collector.stop("stopped");
          this.trackPanels.delete(guildId);
          await this.updateSettings(guildId, { trackPanelChannelId: null, trackPanelMessageId: null }).catch(() => {});
          return interaction.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent("# ⏹️ Playback stopped\nLightCore has stopped playback."))] });
        } else if (action === "queue") {
          const list = fresh.queue?.tracks || [];
          const lines = list.slice(0, 15).map((item, index) => "**" + (index + 1) + ".** " + this.escape(item.info?.title || "Unknown track") + " · " + this.formatDuration(item.info?.duration));
          return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📜 LIGHTCORE • QUEUE\n" + (lines.join("\n") || "*No upcoming tracks.*")))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } else if (action === "vol_down" || action === "vol_up") {
          await fresh.setVolume(Math.max(0, Math.min(100, Number(fresh.volume ?? settings.defaultVolume) + (action === "vol_up" ? 10 : -10))));
        } else if (action === "seek_back" || action === "seek_forward") {
          const current = fresh.queue?.current;
          const length = Number(current?.info?.duration || 0);
          if (!current || current.info?.isStream || !length || typeof fresh.seek !== "function") {
            return interaction.reply({ content: "Seeking is unavailable for this track.", ephemeral: true }).catch(() => {});
          }
          const target = Math.max(0, Math.min(length - 1000, Number(fresh.position || 0) + (action === "seek_forward" ? 10000 : -10000)));
          await fresh.seek(target);
        } else if (action === "loop") {
          const next = settings.loop === "off" ? "track" : settings.loop === "track" ? "queue" : "off";
          await this.updateSettings(guildId, { loop: next });
          if (typeof fresh.setRepeatMode === "function") await fresh.setRepeatMode(next);
        } else if (action === "autoplay") {
          await this.updateSettings(guildId, { autoplay: !settings.autoplay });
        } else if (action === "shuffle") {
          if ((fresh.queue?.tracks?.length || 0) < 2) return interaction.reply({ content: "Add at least two upcoming tracks before shuffling.", ephemeral: true }).catch(() => {});
          await fresh.queue.shuffle();
        }
        const latest = this.getPlayer(guildId) || fresh;
        await interaction.update({ components: [this.trackContainer(latest, latest.queue?.current || currentTrack), ...this.trackControls(latest)] });
      } catch (error) {
        logger.warn("Music", "Track panel action failed:", error);
        const response = { content: "That control failed: " + this.escape(error?.message || "unknown error"), ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
        else await interaction.reply(response).catch(() => {});
      }
    });

    collector.on("end", () => {
      const tracked = this.trackPanels.get(guildId);
      if (tracked?.message?.id === sent.id) this.trackPanels.delete(guildId);
    });
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
