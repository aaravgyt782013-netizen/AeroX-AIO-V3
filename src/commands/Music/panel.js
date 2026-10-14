import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder
} from "discord.js";

const COLORS = { primary: 0x5865F2, success: 0x57F287, warning: 0xFEE75C, danger: 0xED4245 };
function registeredEmoji(client, names, fallback) {
  const wanted = (Array.isArray(names) ? names : [names]).map(name => String(name).toLowerCase());
  const pools = [client?.application?.emojis?.cache, client?.emojis?.cache];
  for (const guild of client?.guilds?.cache?.values?.() || []) pools.push(guild.emojis?.cache);
  for (const pool of pools) {
    if (!pool) continue;
    const found = pool.find?.(emoji => wanted.some(name => emoji.name?.toLowerCase() === name || emoji.name?.toLowerCase().includes(name)));
    if (found) return { id: found.id, name: found.name, animated: Boolean(found.animated) };
  }
  return fallback;
}

const clean = value => String(value ?? "").replace(/[@\\*_~]/g, "").replace(/[\r\n]/g, " ").slice(0, 150);
const duration = ms => {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return "LIVE";
  const seconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : minutes + ":" + String(seconds % 60).padStart(2, "0");
};
const titleOf = track => clean(track?.info?.title || "Unknown track");
const artworkOf = track => { const value = track?.info?.artworkUrl || track?.info?.thumbnail || track?.info?.image; return /^https?:\/\//i.test(String(value || "")) ? value : null; };
const trackLink = track => /^https?:\/\//i.test(track?.info?.uri || "") ? track.info.uri : null;

function categoryMenu(client, category) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId("aerox_panel:category")
    .setPlaceholder("🧭  Navigate music settings")
    .setMinValues(1).setMaxValues(1)
    .addOptions(
      { label: "Playback", value: "playback", description: "Default volume, search source and repeat", emoji: registeredEmoji(client, ["music", "headphones", "play"], "🎧"), default: category === "playback" },
      { label: "Queue", value: "queue", description: "Queue capacity and request handling", emoji: registeredEmoji(client, ["queue", "playlist"], "📜"), default: category === "queue" },
      { label: "Smart Playback", value: "smartplayback", description: "Autoplay and automatic continuation", emoji: registeredEmoji(client, ["autoplay", "sparkles"], "✨"), default: category === "smartplayback" },
      { label: "DJ & Permissions", value: "access", description: "DJ role and control permissions", emoji: registeredEmoji(client, ["dj", "shield", "security"], "🛡️"), default: category === "access" },
      { label: "Channels", value: "channels", description: "Restrict request and voice channels", emoji: registeredEmoji(client, ["lock", "channel"], "🔒"), default: category === "channels" },
      { label: "Announcements", value: "display", description: "Per-song announcement messages", emoji: registeredEmoji(client, ["announce", "notification"], "📣"), default: category === "display" },
      { label: "Now Playing", value: "nowplaying", description: "Artwork and requester display", emoji: registeredEmoji(client, ["artwork", "image"], "🖼️"), default: category === "nowplaying" }
    ));
}

function settingMenu(client, category, settings) {
  let options = [];
  if (category === "playback") options = [
    { label: "Default volume · " + settings.defaultVolume + "%", value: "defaultVolume:" + settings.defaultVolume, description: "Choose the starting volume for new sessions", emoji: "🔊" },
    { label: "Search provider · " + settings.defaultSource, value: "defaultSource:" + settings.defaultSource, description: "YouTube Music, YouTube or SoundCloud", emoji: "🔎" },
    { label: "Default repeat · " + settings.loop, value: "loop:" + settings.loop, description: "Off, repeat one track or repeat the queue", emoji: "🔁" },
    { label: "Autoplay · " + (settings.autoplay ? "On" : "Off"), value: "autoplay:" + (settings.autoplay ? "on" : "off"), description: "Continue with recommendations when the queue ends", emoji: "✨" }
  ];
  if (category === "queue") options = [
    { label: "Queue capacity · " + settings.maxQueue, value: "maxQueue:" + settings.maxQueue, description: "Maximum upcoming tracks allowed per server", emoji: "📚" }
  ];
  if (category === "smartplayback") options = [
    { label: "Autoplay · " + (settings.autoplay ? "On" : "Off"), value: "autoplay:" + (settings.autoplay ? "on" : "off"), description: "Continue with similar music when the queue ends", emoji: "✨" }
  ];
  if (category === "display") options = [
    { label: "Track announcements · " + (settings.announceNowPlaying ? "On" : "Off"), value: "announceNowPlaying:" + (settings.announceNowPlaying ? "on" : "off"), description: "Route the single live player panel to the configured announcement channel", emoji: "📣" }
  ];
  if (category === "nowplaying") options = [
    { label: "Show requester · " + (settings.showRequester ? "On" : "Off"), value: "showRequester:" + (settings.showRequester ? "on" : "off"), description: "Display who requested the current track", emoji: "🙋" },
    { label: "Show artwork · " + (settings.showArtwork ? "On" : "Off"), value: "showArtwork:" + (settings.showArtwork ? "on" : "off"), description: "Display track artwork when the source provides it", emoji: "🖼️" }
  ];
  if (!options.length) return null;
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId("aerox_panel:setting")
    .setPlaceholder("⚙️  Select a setting to customise")
    .setMinValues(1).setMaxValues(1)
    .addOptions(options));
}

function controls(client, player, settings) {
  const active = Boolean(player);
  const primary = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aerox_panel:previous").setEmoji(registeredEmoji(client, ["previous", "back"], "⏮️")).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:toggle").setEmoji(registeredEmoji(client, [player?.paused ? "play" : "pause"], player?.paused ? "▶️" : "⏸️")).setLabel(player?.paused ? "Resume" : "Pause").setStyle(ButtonStyle.Primary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:skip").setEmoji(registeredEmoji(client, ["skip", "next"], "⏭️")).setLabel("Skip").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:stop").setEmoji(registeredEmoji(client, ["stop"], "⏹️")).setLabel("Stop").setStyle(ButtonStyle.Danger).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:queue").setEmoji(registeredEmoji(client, ["queue", "playlist"], "📜")).setLabel("Queue").setStyle(ButtonStyle.Secondary).setDisabled(!active)
  );
  const secondary = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aerox_panel:vol_down").setLabel("− 10").setEmoji(registeredEmoji(client, ["volume_down", "vol_down", "volume"], "🔉")).setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:vol_up").setLabel("+ 10").setEmoji(registeredEmoji(client, ["volume_up", "vol_up", "volume"], "🔊")).setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:loop").setLabel("Repeat · " + settings.loop).setEmoji(registeredEmoji(client, ["loop", "repeat"], "🔁")).setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:shuffle").setLabel("Shuffle").setEmoji(registeredEmoji(client, ["shuffle"], "🔀")).setStyle(ButtonStyle.Secondary).setDisabled((player?.queue?.tracks?.length || 0) < 2),
    new ButtonBuilder().setCustomId("aerox_panel:autoplay").setLabel("Autoplay " + (settings.autoplay ? "On" : "Off")).setEmoji(registeredEmoji(client, ["autoplay", "sparkles"], "✨")).setStyle(settings.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
  const seeking = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aerox_panel:seek_back").setLabel("−10 sec").setEmoji(registeredEmoji(client, ["seek_back", "rewind"], "⏪")).setStyle(ButtonStyle.Secondary).setDisabled(!active || !player?.queue?.current || Boolean(player?.queue?.current?.info?.isStream)),
    new ButtonBuilder().setCustomId("aerox_panel:seek_forward").setLabel("+10 sec").setEmoji(registeredEmoji(client, ["seek_forward", "forward"], "⏩")).setStyle(ButtonStyle.Secondary).setDisabled(!active || !player?.queue?.current || Boolean(player?.queue?.current?.info?.isStream))
  );
  return [primary, secondary, seeking];
}

function buildDashboard(client, guild) {
  const manager = client.music;
  const settings = manager.getSettings(guild.id);
  const player = manager.getPlayer(guild.id);
  const current = player?.queue?.current;
  const upcoming = player?.queue?.tracks || [];
  const total = Number(current?.info?.duration || 0);
  const position = Math.max(0, Number(player?.position || 0));
  const progress = total > 0 ? Math.max(0, Math.min(18, Math.floor(position / total * 18))) : 0;
  const bar = current?.info?.isStream ? "🔴 LIVE STREAM" : total > 0 ? "▬".repeat(progress) + "🔘" + "▬".repeat(Math.max(0, 17 - progress)) : "━━━━━━━━━━━━━━━━━━";
  const title = current ? (trackLink(current) ? "[" + titleOf(current) + "](" + trackLink(current) + ")" : "**" + titleOf(current) + "**") : "*Nothing is playing yet — use .play <song or URL>*";
  const status = !player ? "IDLE" : player.paused ? "PAUSED" : player.playing ? "PLAYING" : "CONNECTED";
  const artwork = settings.showArtwork ? artworkOf(current) : null;
  const now = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(
    "## " + (player?.paused ? "⏸️ PAUSED" : current ? "🎶 NOW PLAYING" : "🎧 READY TO PLAY") + "\n" +
    title + "\n-# " + clean(current?.info?.author || "LightCore Music") + "\n\n" +
    bar + "\n`" + (current ? duration(position) : "0:00") + " / " + (current ? duration(total) : "0:00") + "`"
  ));
  if (artwork) now.setThumbnailAccessory(new ThumbnailBuilder().setURL(artwork).setDescription("Artwork for " + titleOf(current)));
  const hero = new ContainerBuilder().setAccentColor(current ? COLORS.success : COLORS.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# ✦ LIGHTCORE MUSIC\n-# THE MUSIC EXPERIENCE FOR YOUR SERVER\n## " + clean(guild.name) +
      "\nSearch, queue, and control music without leaving Discord."
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(now)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "### 📡 PLAYER STATUS\n" +
      "**Status** · " + status + "   **Volume** · " + String(player?.volume ?? settings.defaultVolume) + "%\n" +
      "**Repeat** · " + settings.loop + "   **Autoplay** · " + (settings.autoplay ? "On" : "Off") + "\n" +
      "**Up next** · " + upcoming.length + " track(s)" +
      (settings.showRequester && current?.requester?.username ? "   **Requested by** · " + clean(current.requester.username) : "")
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "### 📜 UP NEXT\n" +
      (upcoming.slice(0, 3).map((track, i) => "**" + (i + 1) + ".** " + titleOf(track) + " · " + duration(track.info?.duration)).join("\n") || "*Your queue is empty. Try .play <song> to add music.*") +
      (upcoming.length > 3 ? "\n-# And " + (upcoming.length - 3) + " more track(s) in the queue." : "")
    ));
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aerox_panel:open_settings").setLabel("Server Settings").setEmoji(registeredEmoji(client, ["settings", "gear"], "⚙️")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("aerox_panel:refresh").setLabel("Refresh").setEmoji(registeredEmoji(client, ["refresh", "reload"], "🔄")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("aerox_panel:clear_queue").setLabel("Clear Queue").setEmoji(registeredEmoji(client, ["clear", "trash"], "🧹")).setStyle(ButtonStyle.Danger).setDisabled(upcoming.length === 0),
    new ButtonBuilder().setCustomId("aerox_panel:stay247").setLabel("24/7 · " + (settings.stay247 ? "On" : "Off")).setEmoji(registeredEmoji(client, ["247", "infinity"], "♾️")).setStyle(settings.stay247 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!player && !settings.stay247)
  );
  return { components: [hero, ...controls(client, player, settings), nav] };
}

function buildPlayerMessage(client, guild) {
  const manager = client.music;
  const settings = manager.getSettings(guild.id);
  const player = manager.getPlayer(guild.id);
  const hero = buildPanel(client, guild, "playback").components[0];
  const settingsButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aerox_panel:open_settings")
      .setLabel("Music Settings")
      .setEmoji(registeredEmoji(client, ["settings", "gear"], "⚙️"))
      .setStyle(ButtonStyle.Secondary)
  );
  return { components: [hero, ...controls(client, player, settings), settingsButton] };
}

function buildPanel(client, guild, category) {
  const manager = client.music;
  const settings = manager.getSettings(guild.id);
  const player = manager.getPlayer(guild.id);
  const current = player?.queue?.current;
  const trackDuration = Number(current?.info?.duration || 0);
  const position = Math.max(0, Number(player?.position || 0));
  const progress = trackDuration > 0
    ? Math.max(0, Math.min(16, Math.floor((position / trackDuration) * 16)))
    : 0;
  const progressBar = trackDuration > 0
    ? "▬".repeat(progress) + "🔘" + "▬".repeat(Math.max(0, 15 - progress))
    : (current?.info?.isStream ? "🔴 LIVE STREAM" : "━━━━━━━━━━━━━━━━");
  const playerState = !player ? "IDLE" : player.paused ? "PAUSED" : player.playing ? "NOW PLAYING" : "CONNECTED";
  const songTitle = current ? (trackLink(current) ? "[" + titleOf(current) + "](" + trackLink(current) + ")" : "**" + titleOf(current) + "**") : "*Nothing is playing yet*";
  const artist = clean(current?.info?.author || "Unknown artist");
  const categoryInfo = {
    playback: {
      icon: "🎚️", title: "Playback preferences",
      description: "Set the sound and behavior LightCore uses when your community starts a session.",
      detail: "**Starting volume** · " + settings.defaultVolume + "%\n**Search provider** · " + settings.defaultSource + "\n**Default repeat** · " + settings.loop + "\n**Autoplay** · " + (settings.autoplay ? "Enabled" : "Disabled")
    },
    queue: {
      icon: "📚", title: "Queue management",
      description: "Control how many tracks listeners can add to the server queue.",
      detail: "**Queue capacity** · " + settings.maxQueue + " tracks\n\n-# The limit is applied when tracks are added."
    },
    smartplayback: {
      icon: "✨", title: "Smart playback",
      description: "Choose whether LightCore automatically finds another track when the queue ends.",
      detail: "**Autoplay** · " + (settings.autoplay ? "Enabled" : "Disabled") + "\n**Default repeat** · " + settings.loop + "\n\n-# Autoplay is saved per server."
    },
    nowplaying: {
      icon: "🖼️", title: "Now-playing appearance",
      description: "Customise the details shown in LightCore's live player and track messages.",
      detail: "**Artwork** · " + (settings.showArtwork ? "Shown when available" : "Hidden") + "\n**Requester** · " + (settings.showRequester ? "Shown" : "Hidden") + "\n\n-# Artwork availability depends on the music source."
    },
    access: {
      icon: "🛡️", title: "DJ access control",
      description: "Choose who can manage the player. Server managers always retain an override.",
      detail: "**DJ role** · " + (settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Not configured") + "\n**Override** · Manage Server\n\n-# Select a role below, or remove the restriction to let everyone control playback."
    },
    channels: {
      icon: "🔒", title: "Channel restrictions",
      description: "Restrict song requests to one text channel and playback to one voice channel.",
      detail: "**Request channel** · " + (settings.requestChannelId ? "<#" + settings.requestChannelId + ">" : "Any text channel") + "\n**Allowed voice channel** · " + (settings.allowedVoiceChannelId ? "<#" + settings.allowedVoiceChannelId + ">" : "Any voice channel") + "\n\n-# These restrictions apply to new music requests."
    },
    display: {
      icon: "📣", title: "Player announcements",
      description: "Control the extra track announcements posted when music changes.",
      detail: "**Track announcements** · " + (settings.announceNowPlaying ? "Enabled" : "Disabled") + "\n**Announcement channel** · " + (settings.announcementChannelId ? "<#" + settings.announcementChannelId + ">" : "Use song request channel") + "\n\n-# Every song announcement includes an Open Music Control Panel button."
    }
  }[category] || { icon: "🎧", title: "Music settings", description: "Customise your server's music experience.", detail: "" };

  const guildIcon = typeof guild.iconURL === "function" ? guild.iconURL({ extension: "png", size: 256 }) : null;
  const songSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "### " + (player?.paused ? "⏸️ PAUSED" : current ? "🎶 NOW PLAYING" : "💤 READY WHEN YOU ARE") + "\n" +
      songTitle + "\n-# " + artist + "\n\n" + progressBar + "\n`" +
      (current ? duration(position) : "0:00") + " / " + (current ? duration(trackDuration) : "0:00") + "`"
    ));
  if (settings.showArtwork && artworkOf(current)) songSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(artworkOf(current)).setDescription("Album artwork for " + titleOf(current)));
  const hero = new ContainerBuilder().setAccentColor(current ? COLORS.success : COLORS.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# ✦ LIGHTCORE MUSIC\n-# YOUR SERVER. YOUR SOUND.\n## " + clean(guild.name) + "\nA visual music player for your community."
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(songSection)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "### 📡 SESSION OVERVIEW\n" +
      "**Status**  " + playerState + "     **Volume**  " + String(player?.volume ?? settings.defaultVolume) + "%\n" +
      "**Up next**  " + String(player?.queue?.tracks?.length || 0) + " tracks     **Repeat**  " + settings.loop + "\n" +
      "**Autoplay**  " + (settings.autoplay ? "On" : "Off")
    ));

  const settingsCard = new ContainerBuilder().setAccentColor(COLORS.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# " + categoryInfo.icon + "  " + categoryInfo.title + "\n" +
      categoryInfo.description + "\n\n" + categoryInfo.detail
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LIGHTCORE  /  MUSIC SETTINGS  /  SAVED PER SERVER"));

  const rows = [categoryMenu(client, category)];
  const menu = settingMenu(client, category, settings);
  if (menu) rows.push(menu);
  if (category === "display") {
    rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
      .setCustomId("aerox_panel:announce_channel")
      .setPlaceholder("📣  Choose the song announcement channel")
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId("aerox_panel:clear_announce_channel")
      .setLabel("Use song request channel")
      .setEmoji(registeredEmoji(client, ["back", "return"], "↩️"))
      .setStyle(ButtonStyle.Secondary)));
  }
  if (category === "channels") {
    rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
      .setCustomId("aerox_panel:request_channel")
      .setPlaceholder("💬  Restrict requests to a text channel")
      .setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
      .setCustomId("aerox_panel:voice_channel")
      .setPlaceholder("🔊  Restrict playback to a voice channel")
      .setChannelTypes(ChannelType.GuildVoice).setMinValues(1).setMaxValues(1)));
  }
  if (category === "access") {
    rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
      .setCustomId("aerox_panel:djrole")
      .setPlaceholder("🛡️  Choose the DJ role for this server")
      .setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_panel:clear_dj").setLabel("Remove DJ restriction").setEmoji(registeredEmoji(client, ["unlock", "open"], "🔓")).setStyle(ButtonStyle.Secondary)
    ));
  }
  if (category === "playback" || category === "queue" || category === "smartplayback") rows.push(...controls(client, player, settings));
  return { components: [hero, settingsCard, ...rows] };
}

async function showQueue(interaction, player) {
  const manager = interaction.client.music;
  const guildId = interaction.guildId;
  const render = () => {
    const fresh = manager.getPlayer(guildId) || player;
    const tracks = fresh?.queue?.tracks || [];
    const current = fresh?.queue?.current;
    const lines = tracks.slice(0, 15).map((track, index) => "**" + (index + 1) + ".** " + titleOf(track) + " · " + duration(track.info?.duration));
    const container = new ContainerBuilder().setAccentColor(COLORS.primary)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "# 📜 LIGHTCORE • QUEUE MANAGER\n" +
        (current ? "🎵 **Now playing:** " + titleOf(current) + "\n\n" : "") +
        (lines.join("\n") || "*No upcoming tracks.*") +
        (tracks.length > 15 ? "\n\n…and " + (tracks.length - 15) + " more tracks." : "") +
        "\n\n-# " + tracks.length + " upcoming track(s) · select a track to remove it"
      ));
    const components = [container];
    if (tracks.length) {
      components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId("aerox_queue:remove")
        .setPlaceholder("🗑️  Select an upcoming track to remove")
        .setMinValues(1).setMaxValues(1)
        .addOptions(tracks.slice(0, 25).map((track, index) => ({
          label: (index + 1) + ". " + titleOf(track).slice(0, 85),
          description: duration(track.info?.duration),
          value: String(index)
        })))));
    }
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_queue:shuffle").setLabel("Shuffle").setEmoji(registeredEmoji(client, ["shuffle"], "🔀")).setStyle(ButtonStyle.Secondary).setDisabled(tracks.length < 2),
      new ButtonBuilder().setCustomId("aerox_queue:clear").setLabel("Clear queue").setEmoji(registeredEmoji(client, ["clear", "trash"], "🧹")).setStyle(ButtonStyle.Danger).setDisabled(tracks.length === 0),
      new ButtonBuilder().setCustomId("aerox_queue:refresh").setLabel("Refresh").setEmoji(registeredEmoji(client, ["refresh", "reload"], "🔄")).setStyle(ButtonStyle.Primary)
    ));
    return { components };
  };
  const sent = await interaction.reply({
    ...render(),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true
  });
  const collector = sent.createMessageComponentCollector({ time: 120000 });
  collector.on("collect", async control => {
    if (control.user.id !== interaction.user.id) {
      return control.reply({ content: "Open your own queue panel to manage these tracks.", ephemeral: true }).catch(() => {});
    }
    const member = await control.guild?.members.fetch(control.user.id).catch(() => null);
    if (!member) return control.reply({ content: "I could not verify your server membership.", ephemeral: true }).catch(() => {});
    const settings = manager.getSettings(guildId);
    const active = manager.getPlayer(guildId);
    if (control.customId !== "aerox_queue:refresh") {
      if (!member.voice.channel) return control.reply({ content: "Join a voice channel first to manage the queue.", ephemeral: true }).catch(() => {});
      if (active?.voiceChannelId && member.voice.channel.id !== active.voiceChannelId) return control.reply({ content: "Join the same voice channel as LightCore first.", ephemeral: true }).catch(() => {});
      const destructive = ["aerox_queue:clear", "aerox_queue:remove"].includes(control.customId);
      const hasDJAccess = member.permissions.has(PermissionFlagsBits.ManageGuild) || Boolean(settings.djRoleId && member.roles.cache.has(settings.djRoleId));
      if (destructive && !hasDJAccess) return control.reply({ content: "Removing or clearing queued tracks requires Manage Server or the configured DJ role.", ephemeral: true }).catch(() => {});
      if (!destructive && settings.djRoleId && !member.permissions.has(PermissionFlagsBits.ManageGuild) && !member.roles.cache.has(settings.djRoleId)) {
        return control.reply({ content: "You need the configured DJ role <@&" + settings.djRoleId + "> to manage the queue.", ephemeral: true }).catch(() => {});
      }
    }
    try {
      const fresh = manager.getPlayer(guildId);
      if (!fresh) return control.update({ components: [new ContainerBuilder().setAccentColor(COLORS.warning).addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎧 Queue unavailable\nThe music session has ended."))] });
      if (control.customId === "aerox_queue:remove") {
        const index = Number(control.values?.[0]);
        const tracks = fresh.queue?.tracks || [];
        if (!Number.isInteger(index) || index < 0 || index >= tracks.length) return control.reply({ content: "That queue item is no longer available. Refresh and try again.", ephemeral: true });
        const [removed] = tracks.splice(index, 1);
        await control.update(render());
        return control.followUp({ content: "Removed **" + titleOf(removed) + "** from the queue.", ephemeral: true }).catch(() => {});
      }
      if (control.customId === "aerox_queue:clear") {
        const tracks = fresh.queue?.tracks || [];
        const count = tracks.length;
        tracks.splice(0, count);
        await control.update(render());
        return control.followUp({ content: "Cleared " + count + " upcoming track(s). The current track will keep playing.", ephemeral: true }).catch(() => {});
      }
      if (control.customId === "aerox_queue:shuffle") {
        await fresh.queue.shuffle();
      }
      await control.update(render());
    } catch (error) {
      const msg = clean(error?.message || error);
      if (control.deferred || control.replied) await control.followUp({ content: "Queue action failed: " + msg, ephemeral: true }).catch(() => {});
      else await control.reply({ content: "Queue action failed: " + msg, ephemeral: true }).catch(() => {});
    }
  });
  collector.on("end", () => {
    sent.edit({ components: [new ContainerBuilder().setAccentColor(COLORS.primary).addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📜 LIGHTCORE • QUEUE MANAGER\nThis queue panel expired. Press Queue on the music player to open a fresh one."))] }).catch(() => {});
  });
  return sent;
}
export async function openMusicPanel({ client, message }) {
  if (!message.guild || !message.member) return;
  if (!client.music) return message.reply("The music manager is not ready yet.");
  let category = "playback";
  const sent = await message.reply({ ...buildDashboard(client, message.guild), flags: MessageFlags.IsComponentsV2 });
  const collector = sent.createMessageComponentCollector();
  collector.on("collect", async interaction => {
    if (interaction.guildId !== message.guild.id) return interaction.reply({ content: "This panel belongs to another server.", ephemeral: true }).catch(() => {});
    const actor = await message.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actor) return interaction.reply({ content: "I could not verify your server membership.", ephemeral: true }).catch(() => {});
    const manager = client.music;
    let player = manager.getPlayer(message.guild.id);
    const settings = manager.getSettings(message.guild.id);
    const action = interaction.customId.split(":").at(-1);
    const isSettings = ["open_settings", "category", "setting", "djrole", "clear_dj", "announce_channel", "clear_announce_channel", "request_channel", "clear_request_channel", "voice_channel", "clear_voice_channel", "volume_setting", "queue_setting", "source_setting", "loop_setting", "autoplay", "stay247"].includes(action);
    const hasDJAccess = actor.permissions.has(PermissionFlagsBits.ManageGuild) || Boolean(settings.djRoleId && actor.roles.cache.has(settings.djRoleId));
    if (action === "clear_queue" && !hasDJAccess) return interaction.reply({ content: "Clearing the queue requires Manage Server or the configured DJ role.", ephemeral: true }).catch(() => {});
    if (isSettings && !actor.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "Only members with **Manage Server** can change music settings.", ephemeral: true }).catch(() => {});
    }
    const voice = actor.voice.channel;
    const isPlayback = !isSettings && action !== "refresh";
    if (isPlayback) {
      if (!voice) return interaction.reply({ content: "Join a voice channel first to control playback.", ephemeral: true }).catch(() => {});
      if (player?.voiceChannelId && player.voiceChannelId !== voice.id) return interaction.reply({ content: "Join the same voice channel as LightCore to control playback.", ephemeral: true }).catch(() => {});
      if (settings.allowedVoiceChannelId && voice.id !== settings.allowedVoiceChannelId) return interaction.reply({ content: "Music playback is restricted to <#" + settings.allowedVoiceChannelId + "> in this server.", ephemeral: true }).catch(() => {});
      if (!actor.permissions.has(PermissionFlagsBits.ManageGuild) && settings.djRoleId && !actor.roles.cache.has(settings.djRoleId)) {
        return interaction.reply({ content: "You need the configured DJ role <@&" + settings.djRoleId + "> to control music.", ephemeral: true }).catch(() => {});
      }
    }
    try {
      if (action === "open_settings") {
        return openMusicSettingsPanel({
          client,
          message: {
            guild: message.guild,
            member: actor,
            reply: options => interaction.reply({
              ...options,
              flags: (options.flags || 0) | MessageFlags.Ephemeral,
              fetchReply: true
            })
          }
        });
      } else if (action === "refresh") {
        return interaction.update(buildDashboard(client, message.guild));
      } else if (action === "clear_queue") {
        if (!player) return interaction.reply({ content: "There is no active player.", ephemeral: true }).catch(() => {});
        const queue = player.queue?.tracks || [];
        const removed = queue.length;
        queue.splice(0, queue.length);
        await interaction.update(buildDashboard(client, message.guild));
        return interaction.followUp({ content: "Cleared " + removed + " upcoming track(s). The current song will keep playing.", ephemeral: true }).catch(() => {});
      } else if (action === "category") {
        category = interaction.values[0];
      } else if (action === "setting") {
        const [key, value] = interaction.values[0].split(":");
        let patch = {};
        if (key === "defaultVolume") {
          const choices = [10, 25, 50, 70, 80, 100];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("aerox_panel:volume_setting").setPlaceholder("Choose the default volume")
            .addOptions(choices.map(n => ({ label: n + "%", value: String(n), default: n === settings.defaultVolume }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(client, category), row, ...controls(client, player, settings)] });
        }
        if (key === "maxQueue") {
          const choices = [25, 50, 100, 250, 500];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("aerox_panel:queue_setting").setPlaceholder("Choose the maximum queue size")
            .addOptions(choices.map(n => ({ label: n + " tracks", value: String(n), default: n === settings.maxQueue }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(client, category), row, ...controls(client, player, settings)] });
        }
        if (key === "defaultSource") {
          const choices = [{ label: "YouTube Music", value: "ytmsearch" }, { label: "YouTube", value: "ytsearch" }, { label: "SoundCloud", value: "scsearch" }];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("aerox_panel:source_setting").setPlaceholder("Choose the default search source").addOptions(choices.map(option => ({ ...option, default: option.value === settings.defaultSource }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(client, category), row, ...controls(client, player, settings)] });
        }
        if (key === "loop") {
          const choices = ["off", "track", "queue"];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("aerox_panel:loop_setting").setPlaceholder("Choose the default repeat mode").addOptions(choices.map(mode => ({ label: mode === "off" ? "Off" : mode === "track" ? "Repeat track" : "Repeat queue", value: mode, default: mode === settings.loop }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(client, category), row, ...controls(client, player, settings)] });
        }
        if (["autoplay", "announceNowPlaying", "showRequester", "showArtwork"].includes(key)) patch[key] = value === "on";
        if (key === "autoplay" && value === "on") patch.loop = "off";
        if (Object.keys(patch).length) {
          await manager.updateSettings(message.guild.id, patch);
          if (patch.autoplay === true) { const activePlayer = manager.getPlayer(message.guild.id); if (activePlayer && typeof activePlayer.setRepeatMode === "function") await activePlayer.setRepeatMode("off"); }
        }
      } else if (action === "volume_setting") {
        await manager.updateSettings(message.guild.id, { defaultVolume: Number(interaction.values[0]) });
      } else if (action === "queue_setting") {
        await manager.updateSettings(message.guild.id, { maxQueue: Number(interaction.values[0]) });
      } else if (action === "source_setting") {
        await manager.updateSettings(message.guild.id, { defaultSource: interaction.values[0] });
      } else if (action === "loop_setting") {
        const mode = interaction.values[0];
        await manager.updateSettings(message.guild.id, { loop: mode, ...(mode !== "off" ? { autoplay: false } : {}) });
        const activePlayer = manager.getPlayer(message.guild.id);
        if (activePlayer && typeof activePlayer.setRepeatMode === "function") await activePlayer.setRepeatMode(mode);
      } else if (action === "djrole") {
        await manager.updateSettings(message.guild.id, { djRoleId: interaction.values[0] });
        category = "access";
      } else if (action === "clear_dj") {
        await manager.updateSettings(message.guild.id, { djRoleId: null });
        category = "access";
      } else if (action === "announce_channel") {
        await manager.updateSettings(message.guild.id, { announcementChannelId: interaction.values[0] });
        category = "display";
      } else if (action === "clear_announce_channel") {
        await manager.updateSettings(message.guild.id, { announcementChannelId: null });
        category = "display";
      } else if (action === "request_channel") {
        await manager.updateSettings(message.guild.id, { requestChannelId: interaction.values[0] });
        category = "channels";
      } else if (action === "clear_request_channel") {
        await manager.updateSettings(message.guild.id, { requestChannelId: null });
        category = "channels";
      } else if (action === "voice_channel") {
        await manager.updateSettings(message.guild.id, { allowedVoiceChannelId: interaction.values[0] });
        category = "channels";
      } else if (action === "clear_voice_channel") {
        await manager.updateSettings(message.guild.id, { allowedVoiceChannelId: null });
        category = "channels";
      } else {
        if (!player && action !== "autoplay" && action !== "stay247") return interaction.reply({ content: "No active player. Start music with .play first.", ephemeral: true }).catch(() => {});
        if (action === "stay247") {
          if (!settings.stay247) {
            if (!player?.voiceChannelId) return interaction.reply({ content: "Start a music session first, then enable 24/7 while LightCore is connected to the voice channel you want it to stay in.", ephemeral: true }).catch(() => {});
            await manager.updateSettings(message.guild.id, {
              stay247: true,
              stay247VoiceChannelId: player.voiceChannelId,
              stay247TextChannelId: player.textChannelId || message.channel.id
            });
          } else {
            await manager.updateSettings(message.guild.id, {
              stay247: false,
              stay247VoiceChannelId: null,
              stay247TextChannelId: null
            });
          }
        } else if (action === "toggle") player.paused ? await player.resume() : await player.pause();
        else if (action === "skip") await player.skip();
        else if (action === "previous") {
          const previous = manager.previousTracks.get(message.guild.id);
          if (!previous) return interaction.reply({ content: "There is no previous track in this session.", ephemeral: true }).catch(() => {});
          player.queue.tracks.unshift(previous);
          if (player.playing) await player.skip();
        } else if (action === "stop") {
          await manager.lavalink.destroyPlayer(message.guild.id, "panel-stop");
        } else if (action === "queue") {
          return showQueue(interaction, player);
        } else if (action === "vol_down" || action === "vol_up") {
          const nextVolume = Math.max(0, Math.min(100, Number(player.volume ?? settings.defaultVolume) + (action === "vol_up" ? 10 : -10)));
          await player.setVolume(nextVolume);
        } else if (action === "seek_back" || action === "seek_forward") {
          const current = player.queue?.current;
          const length = Number(current?.info?.duration || 0);
          if (!current || current.info?.isStream || !length || typeof player.seek !== "function") {
            return interaction.reply({ content: "Seeking is unavailable for this track.", ephemeral: true }).catch(() => {});
          }
          const target = Math.max(0, Math.min(length - 1000, Number(player.position || 0) + (action === "seek_forward" ? 10000 : -10000)));
          await player.seek(target);
        } else if (action === "loop") {
          const next = settings.loop === "off" ? "track" : settings.loop === "track" ? "queue" : "off";
          await manager.updateSettings(message.guild.id, { loop: next });
          if (typeof player.setRepeatMode === "function") await player.setRepeatMode(next);
        } else if (action === "shuffle") {
          if ((player.queue?.tracks?.length || 0) < 2) return interaction.reply({ content: "Add at least two upcoming tracks before shuffling.", ephemeral: true }).catch(() => {});
          await player.queue.shuffle();
        } else if (action === "autoplay") {
          await manager.updateSettings(message.guild.id, { autoplay: !settings.autoplay, ...(!settings.autoplay ? { loop: "off" } : {}) });
          if (!settings.autoplay && player && typeof player.setRepeatMode === "function") await player.setRepeatMode("off");
        }
      }
      await interaction.update(buildDashboard(client, message.guild));
    } catch (error) {
      const text = clean(error?.message || error);
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: "That panel action failed: " + text, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: "That panel action failed: " + text, ephemeral: true }).catch(() => {});
    }
  });
  // Keep dashboard controls active for the lifetime of the bot process; do not strip buttons after 15 minutes.
  return sent;
}

export default {
  name: "musicpanel",
  aliases: ["mpanel", "musicsetup"],
  description: "Open the interactive LightCore music control and settings dashboard.",
  usage: "musicpanel",
  category: "Music",
  cooldown: 5,
  userPermissions: [],
  permissions: [],
  async execute({ client, message }) {
    return openMusicPanel({ client, message });
  }
};


function buildServerSettingsPanel(client, guild, category, selection = null) {
  const settings = client.music.getSettings(guild.id);
  const sections = {
    playback: {
      icon: "🎚️", title: "Playback",
      intro: "Fine-tune how music starts and sounds across your server.",
      summary: [
        "**Default volume**  ·  " + settings.defaultVolume + "%",
        "**Search provider**  ·  " + settings.defaultSource,
        "**Default repeat**  ·  " + settings.loop,
        "**Autoplay**  ·  " + (settings.autoplay ? "🟢 Enabled" : "⚪ Disabled")
      ].join("\n")
    },
    queue: {
      icon: "📚", title: "Queue",
      intro: "Set the maximum number of upcoming tracks listeners may queue.",
      summary: ["**Maximum queue**  ·  " + settings.maxQueue + " tracks"].join("\n")
    },
    smartplayback: {
      icon: "✨", title: "Smart Playback",
      intro: "Control automatic continuation when the current queue finishes.",
      summary: [
        "**Autoplay**  ·  " + (settings.autoplay ? "🟢 Enabled" : "⚪ Disabled"),
        "**Default repeat**  ·  " + settings.loop
      ].join("\n")
    },
    nowplaying: {
      icon: "🖼️", title: "Now Playing",
      intro: "Choose which track details appear in the live player and announcements.",
      summary: [
        "**Artwork**  ·  " + (settings.showArtwork ? "🟢 Shown when available" : "⚪ Hidden"),
        "**Requester**  ·  " + (settings.showRequester ? "🟢 Shown" : "⚪ Hidden")
      ].join("\n")
    },
    channels: {
      icon: "🔒", title: "Channels",
      intro: "Optionally require a dedicated text channel for requests and a specific voice channel for playback.",
      summary: [
        "**Request channel**  ·  " + (settings.requestChannelId ? "<#" + settings.requestChannelId + ">" : "Any text channel"),
        "**Allowed voice channel**  ·  " + (settings.allowedVoiceChannelId ? "<#" + settings.allowedVoiceChannelId + ">" : "Any voice channel")
      ].join("\n")
    },
    access: {
      icon: "🛡️", title: "Access & DJ role",
      intro: "Keep control simple: grant a DJ role or allow every listener to use controls.",
      summary: [
        "**DJ role**  ·  " + (settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Everyone can control playback"),
        "**Admin override**  ·  Manage Server"
      ].join("\n")
    },
    display: {
      icon: "🪄", title: "Display",
      intro: "Decide how LightCore announces new tracks in the request channel.",
      summary: [
        "**Track announcements**  ·  " + (settings.announceNowPlaying ? "🟢 Enabled" : "⚪ Disabled"),
        "**Announcement channel**  ·  " + (settings.announcementChannelId ? "<#" + settings.announcementChannelId + ">" : "Song request channel"),
        "**Song message button**  ·  Open Music Control Panel"
      ].join("\n")
    }
  };
  const section = sections[category] || sections.playback;
  const settingsHeader = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# ✦ LIGHTCORE • MUSIC CONTROL CENTER\n-# SERVER CONFIGURATION\n## " + clean(guild.name) +
      "\nManage playback, queue, smart playback, DJ permissions, channel restrictions, announcements and now-playing layout. Changes save automatically."
    ));
  const serverIcon = typeof guild.iconURL === "function" ? guild.iconURL({ extension: "png", size: 256 }) : null;
  if (serverIcon) settingsHeader.setThumbnailAccessory(new ThumbnailBuilder().setURL(serverIcon).setDescription(clean(guild.name) + " server icon"));
  const container = new ContainerBuilder().setAccentColor(COLORS.primary)
    .addSectionComponents(settingsHeader)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "### " + section.icon + "  " + section.title + "\n" + section.intro + "\n\n" + section.summary
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "-# LIGHTCORE  /  SETTINGS  /  " + category.toUpperCase() + "\nOnly members with Manage Server can edit these options."
    ));

  const rows = [categoryMenu(client, category)];
  if (category === "channels") {
    rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
      .setCustomId("aerox_panel:request_channel")
      .setPlaceholder("💬  Choose music request text channel")
      .setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
      .setCustomId("aerox_panel:voice_channel")
      .setPlaceholder("🔊  Choose allowed voice channel")
      .setChannelTypes(ChannelType.GuildVoice).setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_panel:clear_request_channel").setLabel("Allow any text channel").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("aerox_panel:clear_voice_channel").setLabel("Allow any voice channel").setStyle(ButtonStyle.Secondary)
    ));
  }
  if (selection) {
    const options = selection === "volume"
      ? [10, 25, 50, 70, 80, 100].map(n => ({ label: n + "%", value: String(n), description: n === settings.defaultVolume ? "Current default volume" : "Set the default volume to " + n + "%", default: n === settings.defaultVolume }))
      : selection === "queue"
        ? [25, 50, 100, 250, 500].map(n => ({ label: n + " tracks", value: String(n), description: n === settings.maxQueue ? "Current queue limit" : "Allow up to " + n + " queued tracks", default: n === settings.maxQueue }))
        : selection === "source"
          ? [{ label: "YouTube Music", value: "ytmsearch", description: "Search YouTube Music" }, { label: "YouTube", value: "ytsearch", description: "Search standard YouTube" }, { label: "SoundCloud", value: "scsearch", description: "Search SoundCloud" }].map(o => ({ ...o, default: o.value === settings.defaultSource }))
          : ["off", "track", "queue"].map(mode => ({ label: mode === "off" ? "Off" : mode === "track" ? "Repeat track" : "Repeat queue", value: mode, description: mode === "off" ? "Do not repeat" : mode === "track" ? "Repeat the current track" : "Repeat the full queue", default: mode === settings.loop }));
    const customId = selection === "volume" ? "aerox_panel:volume_setting" : selection === "queue" ? "aerox_panel:queue_setting" : selection === "source" ? "aerox_panel:source_setting" : "aerox_panel:loop_setting";
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId)
      .setPlaceholder(selection === "volume" ? "🔊  Select default volume" : selection === "queue" ? "📚  Select queue capacity" : selection === "source" ? "🔎  Select search provider" : "🔁  Select repeat mode")
      .addOptions(options)));
  } else {
    const menu = settingMenu(client, category, settings);
    if (menu) rows.push(menu);
  }
  if (category === "display") {
    rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
      .setCustomId("aerox_panel:announce_channel")
      .setPlaceholder("📣  Choose the song announcement channel")
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId("aerox_panel:clear_announce_channel")
      .setLabel("Use song request channel")
      .setEmoji(registeredEmoji(client, ["back", "return"], "↩️"))
      .setStyle(ButtonStyle.Secondary)));
  }
  if (category === "access") {
    rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
      .setCustomId("aerox_panel:djrole").setPlaceholder("🛡️  Choose the DJ role")
      .setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId("aerox_panel:clear_dj").setLabel("Remove DJ restriction")
      .setEmoji(registeredEmoji(client, ["unlock", "open"], "🔓")).setStyle(ButtonStyle.Secondary)));
  }
  return { components: [container, ...rows] };
}

export async function openMusicSettingsPanel({ client, message }) {
  if (!message.guild || !message.member) return;
  if (!client.music) return message.reply("The music manager is not ready yet.");
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return message.reply("You need the **Manage Server** permission to configure server music settings.");
  }
  let category = "playback";
  let selection = null;
  const sent = await message.reply({ ...buildServerSettingsPanel(client, message.guild, category), flags: MessageFlags.IsComponentsV2 });
  const collector = sent.createMessageComponentCollector();
  collector.on("collect", async interaction => {
    if (interaction.guildId !== message.guild.id) return interaction.reply({ content: "This settings panel belongs to another server.", ephemeral: true }).catch(() => {});
    const actor = await message.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actor?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "Only members with **Manage Server** can change these settings.", ephemeral: true }).catch(() => {});
    }
    const action = interaction.customId.split(":").at(-1);
    try {
      if (action === "category") {
        category = interaction.values[0];
        selection = null;
      } else if (action === "setting") {
        const [key, value] = interaction.values[0].split(":");
        if (key === "defaultVolume") selection = "volume";
        else if (key === "maxQueue") selection = "queue";
        else if (key === "defaultSource") selection = "source";
        else if (key === "loop") selection = "loop";
        else {
          const enabled = value === "on";
          await client.music.updateSettings(message.guild.id, { [key]: enabled, ...(key === "autoplay" && enabled ? { loop: "off" } : {}) });
          if (key === "autoplay" && enabled) {
            const activePlayer = client.music.getPlayer(message.guild.id);
            if (activePlayer && typeof activePlayer.setRepeatMode === "function") await activePlayer.setRepeatMode("off");
          }
          selection = null;
        }
      } else if (action === "volume_setting") {
        await client.music.updateSettings(message.guild.id, { defaultVolume: Number(interaction.values[0]) });
        selection = null;
      } else if (action === "queue_setting") {
        await client.music.updateSettings(message.guild.id, { maxQueue: Number(interaction.values[0]) });
        selection = null;
      } else if (action === "source_setting") {
        await client.music.updateSettings(message.guild.id, { defaultSource: interaction.values[0] });
        selection = null;
      } else if (action === "loop_setting") {
        const mode = interaction.values[0];
        await client.music.updateSettings(message.guild.id, { loop: mode, ...(mode !== "off" ? { autoplay: false } : {}) });
        const activePlayer = client.music.getPlayer(message.guild.id);
        if (activePlayer && typeof activePlayer.setRepeatMode === "function") await activePlayer.setRepeatMode(mode);
        selection = null;
      } else if (action === "djrole") {
        await client.music.updateSettings(message.guild.id, { djRoleId: interaction.values[0] });
        category = "access";
        selection = null;
      } else if (action === "clear_dj") {
        await client.music.updateSettings(message.guild.id, { djRoleId: null });
        category = "access";
        selection = null;
      } else if (action === "announce_channel") {
        await client.music.updateSettings(message.guild.id, { announcementChannelId: interaction.values[0] });
        category = "display";
        selection = null;
      } else if (action === "clear_announce_channel") {
        await client.music.updateSettings(message.guild.id, { announcementChannelId: null });
        category = "display";
        selection = null;
      } else if (action === "request_channel") {
        await client.music.updateSettings(message.guild.id, { requestChannelId: interaction.values[0] });
        category = "channels";
        selection = null;
      } else if (action === "clear_request_channel") {
        await client.music.updateSettings(message.guild.id, { requestChannelId: null });
        category = "channels";
        selection = null;
      } else if (action === "voice_channel") {
        await client.music.updateSettings(message.guild.id, { allowedVoiceChannelId: interaction.values[0] });
        category = "channels";
        selection = null;
      } else if (action === "clear_voice_channel") {
        await client.music.updateSettings(message.guild.id, { allowedVoiceChannelId: null });
        category = "channels";
        selection = null;
      }
      await interaction.update(buildServerSettingsPanel(client, message.guild, category, selection));
    } catch (error) {
      const detail = clean(error?.message || error);
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: "Could not save that setting: " + detail, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: "Could not save that setting: " + detail, ephemeral: true }).catch(() => {});
    }
  });
  // Keep settings controls active; do not remove their components after 15 minutes.
  return sent;
}
