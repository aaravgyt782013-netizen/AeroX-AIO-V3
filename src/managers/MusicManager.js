import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import { LavalinkManager } from "lavalink-client";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { MusicSettingsStore } from "#managers/music/MusicSettingsStore";
import { searchWithFallback } from "#managers/music/MusicPlaybackService";

const ICON = { previous: "⏮️", toggle: "⏯️", skip: "⏭️", stop: "⏹️", queue: "📜", volumeDown: "🔉", volumeUp: "🔊", loop: "🔁", shuffle: "🔀", autoplay: "✨", dashboard: "🎛️" };
const http = value => /^https?:\/\//i.test(String(value || ""));
const safe = (value, limit = 180) => String(value ?? "").replace(/[@\\*_~`]/g, "").replace(/[\r\n]/g, " ").slice(0, limit);

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.settingsStore = new MusicSettingsStore();
    this.settings = {};
    this.previousTracks = new Map();
    this.panels = new Map();
    this.initialized = false;
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
          autoPlayFunction: async (player, lastTrack) => this.recommendNext(player, lastTrack)
        }
      }
    }) : null;

    if (!this.lavalink) {
      logger.warn("Music", "No Lavalink node configured. Set the Lavalink environment variables in Render.");
      return;
    }

    this.lavalink.on("trackStart", (player, track) => {
      this.publishPlayer(player, track).catch(error => logger.warn("Music", "Could not update player panel:", error));
    });
    this.lavalink.on("trackEnd", (player, track) => {
      if (track) this.previousTracks.set(player.guildId, track);
    });
    this.lavalink.on("trackError", (player, track, payload) => {
      logger.error("Music", "Playback error in " + player.guildId + " for " + safe(track?.info?.title), payload);
      this.sendText(player, "⚠️ That track could not be played. LightCore will continue with the next queued track when possible.").catch(() => {});
    });
    this.lavalink.on("queueEnd", player => {
      this.sendText(player, "✨ The queue is finished. I'll leave the voice channel shortly unless autoplay adds another track.").catch(() => {});
    });
    this.lavalink.nodeManager.on("connect", node => {
      logger.success("MusicNode", "Connected to Lavalink node " + node.id);
      Promise.resolve(node.updateSession?.(true, 300000)).catch(error => logger.warn("MusicNode", "Session resume setup failed:", error));
    });
    this.lavalink.nodeManager.on("reconnecting", node => logger.warn("MusicNode", "Reconnecting to " + node.id));
    this.lavalink.nodeManager.on("disconnect", (node, reason) => logger.warn("MusicNode", "Disconnected from " + node.id + ": " + safe(reason?.reason || reason || "unknown")));
    this.lavalink.nodeManager.on("error", (node, error) => logger.error("MusicNode", "Node error (" + safe(node?.id || "unknown") + "):", error));
  }

  async init() {
    this.settings = await this.settingsStore.init();
    if (!config.music.enabled) {
      logger.warn("Music", "Music is disabled by MUSIC_ENABLED=false.");
      return;
    }
    if (!this.lavalink) return;
    await this.lavalink.init({ id: this.client.user.id, username: this.client.user.username });
    this.initialized = true;
    logger.success("Music", "New music engine initialized with " + this.nodesConfig.length + " Lavalink node(s).");
    await this.restoreStay247();
    this.stay247Timer = setInterval(() => this.restoreStay247().catch(error => logger.warn("Music", "24/7 restore failed:", error)), 30000);
    this.stay247Timer.unref?.();
  }

  sendRawData(data) {
    if (!config.music.enabled || !this.lavalink) return;
    try { void this.lavalink.sendRawData(data); }
    catch (error) { logger.warn("Music", "Could not forward voice data:", error); }
  }

  getPlayer(guildId) { return this.lavalink?.getPlayer(guildId) || null; }
  getSettings(guildId) { return this.settingsStore.get(guildId); }

  async updateSettings(guildId, patch) {
    const next = await this.settingsStore.update(guildId, patch);
    this.settings = this.settingsStore.settings;
    return next;
  }

  async createOrGetPlayer({ guildId, voiceChannelId, textChannelId, volume }) {
    if (!this.lavalink || !this.lavalink.useable) throw new Error("No Lavalink node is currently available.");
    let player = this.getPlayer(guildId);
    if (player?.voiceChannelId && player.voiceChannelId !== voiceChannelId) {
      throw new Error("LightCore is already connected to another voice channel in this server.");
    }
    if (!player) player = this.lavalink.createPlayer({
      guildId, voiceChannelId, textChannelId, selfDeaf: true, volume
    });
    if (textChannelId) player.textChannelId = textChannelId;
    if (!player.connected) await player.connect();
    return player;
  }

  async playQuery({ guildId, voiceChannelId, textChannelId, query, requester }) {
    const settings = this.getSettings(guildId);
    const player = await this.createOrGetPlayer({ guildId, voiceChannelId, textChannelId, volume: settings.defaultVolume });
    if (typeof player.setRepeatMode === "function") await player.setRepeatMode(settings.loop || "off");
    const result = await searchWithFallback(player, query, settings, requester);
    const tracks = result?.tracks || [];
    if (!tracks.length) return { player, result, added: 0, rejected: 0 };
    const { addTracks } = await import("#managers/music/MusicPlaybackService");
    const queued = await addTracks(player, tracks, settings.maxQueue);
    return { player, result, added: queued.accepted, rejected: queued.rejected };
  }

  async recommendNext(player, lastTrack) {
    const guildId = player.guildId;
    const settings = this.getSettings(guildId);
    if (!settings.autoplay || !lastTrack?.info) return;
    // Autoplay is only a fallback after the user queue is exhausted. Never
    // inject a random track while a manually requested queue item is waiting.
    if ((player.queue?.tracks?.length || 0) > 0) return;

    if (typeof player.setRepeatMode === "function") await player.setRepeatMode("off").catch(() => {});

    // Autoplay is intentionally independent of the previous title. Use randomized,
    // broad discovery queries so it doesn't keep replaying the same song/search result.
    const pools = [
      "random song",
      "popular Hindi song",
      "popular English song",
      "viral song",
      "pop song",
      "indie song",
      "rock song",
      "electronic dance song",
      "R&B song",
      "lofi song",
      "trending song",
      "classic hit song",
      "chill song",
      "anime song",
      "hip hop song",
      "acoustic song",
      "Punjabi hit song",
      "Bollywood hit song",
      "K-pop hit song",
      "2000s hit song"
    ];
    for (let i = pools.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pools[i], pools[j]] = [pools[j], pools[i]];
    }

    const identity = track => {
      const info = track?.info || {};
      return String(info.identifier || info.uri || info.title || "").toLowerCase().trim();
    };
    const titleKey = track => String(track?.info?.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const currentId = identity(lastTrack);
    const currentTitle = titleKey(lastTrack);
    const queuedIds = new Set((player.queue?.tracks || []).map(identity));
    const recent = this.recentAutoplayTracks?.get(guildId) || new Set();
    const isNew = track => {
      const id = identity(track);
      const title = titleKey(track);
      return Boolean(id && title && id !== currentId && title !== currentTitle &&
        !queuedIds.has(id) && !recent.has(id));
    };

    for (const query of pools.slice(0, 12)) {
      try {
        const result = await searchWithFallback(
          player, query, { ...settings, defaultSource: settings.defaultSource },
          lastTrack.requester || "LightCore"
        );
        const candidates = (result?.tracks || []).filter(isNew);
        if (!candidates.length) continue;
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        await player.queue.add(candidate);
        if (!this.recentAutoplayTracks) this.recentAutoplayTracks = new Map();
        recent.add(identity(candidate));
        while (recent.size > 20) recent.delete(recent.values().next().value);
        this.recentAutoplayTracks.set(guildId, recent);
        logger.info("Music", "Autoplay queued a randomized recommendation: " + safe(candidate.info?.title));
        return candidate;
      } catch (error) {
        logger.debug("Music", "Random autoplay search failed for " + query + ":", error);
      }
    }
    logger.warn("Music", "Autoplay could not find a fresh recommendation for guild " + guildId);
    return null;
  }

  async restoreStay247() {
    if (!this.initialized) return;
    for (const [guildId, saved] of Object.entries(this.settings)) {
      const settings = this.getSettings(guildId);
      if (!settings.stay247 || !settings.stay247VoiceChannelId || !this.client.guilds.cache.has(guildId)) continue;
      try {
        await this.createOrGetPlayer({
          guildId,
          voiceChannelId: settings.stay247VoiceChannelId,
          textChannelId: settings.stay247TextChannelId || settings.requestChannelId || settings.announcementChannelId,
          volume: settings.defaultVolume
        });
      } catch (error) { logger.warn("Music", "Could not restore 24/7 session:", error); }
    }
  }

  controls(player) {
    const settings = this.getSettings(player.guildId);
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lightcore:previous").setEmoji(ICON.previous).setLabel("Previous").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lightcore:toggle").setEmoji(player.paused ? "▶️" : "⏸️").setLabel(player.paused ? "Resume" : "Pause").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("lightcore:skip").setEmoji(ICON.skip).setLabel("Skip").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lightcore:stop").setEmoji(ICON.stop).setLabel("Stop").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("lightcore:queue").setEmoji(ICON.queue).setLabel("Queue").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lightcore:vol_down").setEmoji(ICON.volumeDown).setLabel("Volume −").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lightcore:vol_up").setEmoji(ICON.volumeUp).setLabel("Volume +").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lightcore:loop").setEmoji(ICON.loop).setLabel("Repeat: " + settings.loop).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lightcore:shuffle").setEmoji(ICON.shuffle).setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lightcore:dashboard").setEmoji(ICON.dashboard).setLabel("Settings").setStyle(ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lightcore:seek_back").setLabel("−10 sec").setStyle(ButtonStyle.Secondary).setDisabled(!player.queue?.current || Boolean(player.queue.current.info?.isStream)),
        new ButtonBuilder().setCustomId("lightcore:seek_forward").setLabel("+10 sec").setStyle(ButtonStyle.Secondary).setDisabled(!player.queue?.current || Boolean(player.queue.current.info?.isStream)),
        new ButtonBuilder().setCustomId("lightcore:autoplay").setEmoji(ICON.autoplay).setLabel("Autoplay: " + (settings.autoplay ? "On" : "Off")).setStyle(settings.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    ];
  }

  playerEmbed(player, track = player?.queue?.current) {
    const info = track?.info || {};
    const settings = this.getSettings(player.guildId);
    const total = Number(info.duration || 0);
    const position = Math.max(0, Number(player.position || 0));
    const progress = info.isStream ? "🔴 LIVE STREAM" : total
      ? "`" + this.formatDuration(position) + " / " + this.formatDuration(total) + "` " + this.progress(position, total)
      : "Duration unavailable";
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("✦ LIGHTCORE • MUSIC PLAYER")
      .setDescription(info.title
        ? (http(info.uri) ? "[" + safe(info.title) + "](" + info.uri + ")" : "**" + safe(info.title) + "**") + "\n" + progress
        : "Nothing is playing. Use `.play <song or URL>` to start a session.")
      .addFields(
        { name: "Artist", value: safe(info.author || "Unknown artist"), inline: true },
        { name: "Duration", value: info.isStream ? "Live" : this.formatDuration(total), inline: true },
        { name: "Queue", value: String(player?.queue?.tracks?.length || 0) + " upcoming", inline: true },
        { name: "Volume", value: String(player?.volume ?? settings.defaultVolume) + "%", inline: true },
        { name: "Repeat", value: settings.loop, inline: true },
        { name: "Autoplay", value: settings.autoplay ? "On" : "Off", inline: true }
      )
      .setFooter({ text: "LightCore • Shared server player" })
      .setTimestamp();
    if (settings.showRequester && track?.requester) embed.addFields({ name: "Requested by", value: safe(track.requester.username || track.requester.tag || "Listener"), inline: true });
    const youtubeArtwork = info.identifier && /(?:youtube\.com|youtu\.be)/i.test(String(info.uri || ""))
      ? "https://img.youtube.com/vi/" + info.identifier + "/hqdefault.jpg" : null;
    const artwork = settings.showArtwork ? (info.artworkUrl || info.thumbnail || info.image || youtubeArtwork) : null;
    if (http(artwork)) embed.setThumbnail(artwork);
    return embed;
  }

  progress(position, total) {
    const slots = 12;
    const active = total > 0 ? Math.min(slots, Math.floor(position / total * slots)) : 0;
    return "▰".repeat(active) + "▱".repeat(slots - active);
  }

  async publishPlayer(player, track = player?.queue?.current) {
    const guildId = player.guildId;
    const settings = this.getSettings(guildId);
    const channelId = (settings.announceNowPlaying && settings.announcementChannelId) || player.textChannelId || settings.announcementChannelId;
    const channel = channelId ? (this.client.channels.cache.get(channelId) || await this.client.channels.fetch(channelId).catch(() => null)) : null;
    if (!channel?.isTextBased()) return;
    const components = this.controls(player);
    const existing = this.panels.get(guildId);
    if (existing?.channelId && existing.channelId !== channel.id) {
      await existing.message?.delete().catch(() => {});
      this.panels.delete(guildId);
    }
    if (existing?.channelId === channel.id && existing.message) {
      try { await existing.message.edit({ embeds: [this.playerEmbed(player, track)], components }); return existing.message; }
      catch { this.panels.delete(guildId); }
    }
    const oldChannelId = settings.trackPanelChannelId;
    const oldMessageId = settings.trackPanelMessageId;
    if (oldChannelId && oldMessageId) {
      const oldChannel = this.client.channels.cache.get(oldChannelId) || await this.client.channels.fetch(oldChannelId).catch(() => null);
      if (oldChannel?.messages) {
        const oldMessage = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
        if (oldMessage) await oldMessage.delete().catch(() => {});
      }
    }
    const message = await channel.send({ embeds: [this.playerEmbed(player, track)], components });
    this.panels.set(guildId, { message, channelId: channel.id });
    await this.updateSettings(guildId, { trackPanelChannelId: channel.id, trackPanelMessageId: message.id }).catch(() => {});
    const collector = message.createMessageComponentCollector({ idle: 6 * 60 * 60 * 1000 });
    collector.on("collect", interaction => this.handleControl(interaction, guildId));
    collector.on("end", () => {
      if (this.panels.get(guildId)?.message?.id === message.id) this.panels.delete(guildId);
    });
    return message;
  }

  async handleControl(interaction, guildId = interaction.guildId) {
    if (!interaction.customId?.startsWith("lightcore:")) return;
    const action = interaction.customId.slice("lightcore:".length);
    const player = this.getPlayer(guildId);
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return interaction.reply({ content: "I couldn't verify your server membership.", ephemeral: true }).catch(() => {});
    const settings = this.getSettings(guildId);
    const privileged = member.permissions.has(PermissionFlagsBits.ManageGuild) || Boolean(settings.djRoleId && member.roles.cache.has(settings.djRoleId));
    if (action === "dashboard") {
      const { openMusicSettingsPanel } = await import("#commands/Music/panel");
      return openMusicSettingsPanel({ client: this.client, interaction, member });
    }
    if (action === "autoplay") {
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "Manage Server permission is required to change autoplay.", ephemeral: true }).catch(() => {});
      }
      const enabled = !settings.autoplay;
      const updated = await this.updateSettings(guildId, { autoplay: enabled, ...(enabled ? { loop: "off" } : {}) });
      const active = this.getPlayer(guildId);
      if (enabled && active) await active.setRepeatMode?.("off");
      if (active) return interaction.update({ embeds: [this.playerEmbed(active)], components: this.controls(active) });
      return interaction.reply({ content: "Autoplay is now " + (updated.autoplay ? "on" : "off") + ".", ephemeral: true });
    }
    if (!player) return interaction.reply({ content: "There is no active music session.", ephemeral: true }).catch(() => {});
    if (!member.voice.channel) return interaction.reply({ content: "Join the voice channel with LightCore first.", ephemeral: true }).catch(() => {});
    if (player.voiceChannelId && member.voice.channel.id !== player.voiceChannelId) return interaction.reply({ content: "Join the same voice channel as LightCore first.", ephemeral: true }).catch(() => {});
    if (settings.djRoleId && !privileged) return interaction.reply({ content: "You need the configured DJ role to control playback.", ephemeral: true }).catch(() => {});
    try {
      if (action === "toggle") player.paused ? await player.resume() : await player.pause();
      else if (action === "skip") await player.skip();
      else if (action === "previous") {
        const previous = this.previousTracks.get(guildId);
        if (!previous) return interaction.reply({ content: "No previous track is stored in this session.", ephemeral: true });
        player.queue.tracks.unshift(previous);
        await player.skip();
      } else if (action === "stop") {
        await this.lavalink.destroyPlayer(guildId, "player-panel-stop");
        this.panels.delete(guildId);
        await interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("Playback stopped").setDescription("LightCore has left the voice channel.")], components: [] });
        return;
      } else if (action === "queue") {
        const tracks = player.queue?.tracks || [];
        const page = tracks.slice(0, 15).map((item, index) => (index + 1) + ". " + safe(item.info?.title)).join("\n");
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("LightCore • Queue").setDescription(page || "No upcoming tracks.")], ephemeral: true });
      } else if (action === "vol_down" || action === "vol_up") {
        await player.setVolume(Math.max(0, Math.min(100, Number(player.volume ?? settings.defaultVolume) + (action === "vol_up" ? 10 : -10))));
      } else if (action === "seek_back" || action === "seek_forward") {
        const current = player.queue?.current;
        const total = Number(current?.info?.duration || 0);
        if (!current || current.info?.isStream || !total || typeof player.seek !== "function") {
          return interaction.reply({ content: "Seeking is unavailable for this track.", ephemeral: true });
        }
        const target = Math.max(0, Math.min(total - 1000, Number(player.position || 0) + (action === "seek_forward" ? 10000 : -10000)));
        await player.seek(target);
      } else if (action === "loop") {
        const loop = settings.loop === "off" ? "track" : settings.loop === "track" ? "queue" : "off";
        await this.updateSettings(guildId, { loop, ...(loop !== "off" ? { autoplay: false } : {}) });
        await player.setRepeatMode?.(loop);
      } else if (action === "shuffle") {
        if ((player.queue?.tracks?.length || 0) < 2) return interaction.reply({ content: "Add at least two tracks before shuffling.", ephemeral: true });
        await player.queue.shuffle();
      }
      await interaction.update({ embeds: [this.playerEmbed(this.getPlayer(guildId) || player)], components: this.controls(this.getPlayer(guildId) || player) });
    } catch (error) {
      const response = { content: "Music control failed: " + safe(error?.message || error), ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    }
  }

  async sendText(player, content) {
    const channel = player?.textChannelId ? this.client.channels.cache.get(player.textChannelId) : null;
    if (channel?.isTextBased()) await channel.send({ content }).catch(() => {});
  }

  formatDuration(ms = 0) {
    if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return "LIVE";
    const seconds = Math.floor(Number(ms) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : minutes + ":" + String(seconds % 60).padStart(2, "0");
  }
}
