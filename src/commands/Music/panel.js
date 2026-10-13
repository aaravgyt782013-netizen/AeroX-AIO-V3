import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder
} from "discord.js";

const COLORS = { primary: 0x5865F2, success: 0x57F287, warning: 0xFEE75C, danger: 0xED4245 };
const clean = value => String(value ?? "").replace(/[@\\*_~]/g, "").replace(/[\r\n]/g, " ").slice(0, 150);
const duration = ms => {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return "LIVE";
  const seconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") : minutes + ":" + String(seconds % 60).padStart(2, "0");
};
const titleOf = track => clean(track?.info?.title || "Unknown track");
const trackLink = track => /^https?:\/\//i.test(track?.info?.uri || "") ? track.info.uri : null;

function categoryMenu(category) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId("aerox_panel:category")
    .setPlaceholder("Choose a music settings page")
    .setMinValues(1).setMaxValues(1)
    .addOptions(
      { label: "Playback", value: "playback", description: "Volume, source, repeat and autoplay", emoji: "🎧", default: category === "playback" },
      { label: "Queue", value: "queue", description: "Queue size and queue behavior", emoji: "📜", default: category === "queue" },
      { label: "Access", value: "access", description: "DJ role and control permissions", emoji: "🛡️", default: category === "access" },
      { label: "Display", value: "display", description: "Now-playing announcements", emoji: "🖼️", default: category === "display" }
    ));
}

function settingMenu(category, settings) {
  let options = [];
  if (category === "playback") options = [
    { label: "Default volume: " + settings.defaultVolume + "%", value: "defaultVolume:" + settings.defaultVolume, description: "Change the starting volume", emoji: "🔊" },
    { label: "Search source: " + settings.defaultSource, value: "defaultSource:" + settings.defaultSource, description: "Choose the default search provider", emoji: "🔎" },
    { label: "Default loop: " + settings.loop, value: "loop:" + settings.loop, description: "Choose the repeat mode", emoji: "🔁" },
    { label: "Autoplay: " + (settings.autoplay ? "On" : "Off"), value: "autoplay:" + (settings.autoplay ? "on" : "off"), description: "Toggle automatic recommendations", emoji: "✨" }
  ];
  if (category === "queue") options = [
    { label: "Queue limit: " + settings.maxQueue, value: "maxQueue:" + settings.maxQueue, description: "Choose the maximum queued tracks", emoji: "📜" },
    { label: "Autoplay: " + (settings.autoplay ? "On" : "Off"), value: "autoplay:" + (settings.autoplay ? "on" : "off"), description: "Continue with similar music when queue ends", emoji: "✨" }
  ];
  if (category === "display") options = [
    { label: "Now-playing announcements: " + (settings.announceNowPlaying ? "On" : "Off"), value: "announceNowPlaying:" + (settings.announceNowPlaying ? "on" : "off"), description: "Toggle track announcement messages", emoji: "📣" }
  ];
  if (!options.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId("aerox_panel:setting")
    .setPlaceholder("Select a setting to edit")
    .setMinValues(1).setMaxValues(1)
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function controls(player, settings) {
  const active = Boolean(player);
  const primary = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aerox_panel:previous").setEmoji("⏮️").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:toggle").setEmoji(player?.paused ? "▶️" : "⏸️").setLabel(player?.paused ? "Resume" : "Pause").setStyle(ButtonStyle.Primary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:skip").setEmoji("⏭️").setLabel("Skip").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:stop").setEmoji("⏹️").setLabel("Stop").setStyle(ButtonStyle.Danger).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:queue").setEmoji("📜").setLabel("Queue").setStyle(ButtonStyle.Secondary).setDisabled(!active)
  );
  const secondary = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aerox_panel:vol_down").setLabel("− Volume").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:vol_up").setLabel("+ Volume").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:loop").setLabel("Loop: " + settings.loop).setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:shuffle").setLabel("Shuffle").setStyle(ButtonStyle.Secondary).setDisabled(!active),
    new ButtonBuilder().setCustomId("aerox_panel:autoplay").setLabel("Autoplay: " + (settings.autoplay ? "On" : "Off")).setStyle(settings.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
  return [primary, secondary];
}

function buildPanel(client, guild, category) {
  const manager = client.music;
  const settings = manager.getSettings(guild.id);
  const player = manager.getPlayer(guild.id);
  const current = player?.queue?.current;
  const fields = [
    { name: "🎵 Now playing", value: current ? (trackLink(current) ? "[" + titleOf(current) + "](" + trackLink(current) + ")" : titleOf(current)) : "*Nothing is playing right now*", inline: false },
    { name: "🎤 Artist", value: clean(current?.info?.author || "—"), inline: true },
    { name: "📡 Player", value: !player ? "Idle" : player.paused ? "Paused" : player.playing ? "Playing" : "Connected", inline: true },
    { name: "🔊 Volume", value: String(player?.volume ?? settings.defaultVolume) + "%", inline: true },
    { name: "📜 Up next", value: String(player?.queue?.tracks?.length || 0) + " track(s)", inline: true },
    { name: "🔁 Repeat", value: settings.loop, inline: true },
    { name: "✨ Autoplay", value: settings.autoplay ? "Enabled" : "Disabled", inline: true }
  ];
  let details = "";
  if (category === "playback") details = [
    "**Default volume:** " + settings.defaultVolume + "%",
    "**Search source:** " + settings.defaultSource,
    "**Default loop:** " + settings.loop,
    "**Autoplay:** " + (settings.autoplay ? "Enabled" : "Disabled"),
    "",
    "Choose an option below to update the server default. The player buttons work on the current live session."
  ].join("\n");
  else if (category === "queue") details = [
    "**Queue limit:** " + settings.maxQueue + " tracks",
    "**Autoplay:** " + (settings.autoplay ? "Enabled" : "Disabled"),
    "",
    "The queue limit applies to new requests and playlists."
  ].join("\n");
  else if (category === "access") details = [
    "**DJ role:** " + (settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Not configured"),
    "**Admin override:** Manage Server",
    "",
    "When a DJ role is configured, music controls are restricted to that role or server managers."
  ].join("\n");
  else details = [
    "**Now-playing announcements:** " + (settings.announceNowPlaying ? "Enabled" : "Disabled"),
    "",
    "When enabled, LightCore announces tracks in the text channel where playback was requested."
  ].join("\n");

  const currentLine = current
    ? "🎵 **Now playing:** " + (trackLink(current) ? "[" + titleOf(current) + "](" + trackLink(current) + ")" : titleOf(current))
    : "🎵 **Now playing:** Nothing is playing right now";
  const statusLines = [
    currentLine,
    "🎤 **Artist:** " + clean(current?.info?.author || "—"),
    "📡 **Player:** " + (!player ? "Idle" : player.paused ? "Paused" : player.playing ? "Playing" : "Connected"),
    "🔊 **Volume:** " + String(player?.volume ?? settings.defaultVolume) + "%",
    "📜 **Up next:** " + String(player?.queue?.tracks?.length || 0) + " track(s)",
    "🔁 **Repeat:** " + settings.loop,
    "✨ **Autoplay:** " + (settings.autoplay ? "Enabled" : "Disabled")
  ].join("\n");
  const panel = new ContainerBuilder()
    .setAccentColor(COLORS.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# 🎛️ LIGHTCORE • MUSIC CONTROL CENTER\n## " + clean(guild.name) + " Music Settings\nYour server’s music command center. Configure playback, queue behavior, DJ access and announcements below."
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### 📊 Live Player\n" + statusLines))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### ⚙️ " + category[0].toUpperCase() + category.slice(1) + " Settings\n" + details))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LightCore Music • Settings sync across redeploys"));
  const rows = [categoryMenu(category)];
  const menu = settingMenu(category, settings);
  if (menu) rows.push(menu);
  if (category === "access") {
    rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
      .setCustomId("aerox_panel:djrole")
      .setPlaceholder("Select the server DJ role")
      .setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aerox_panel:clear_dj").setLabel("Remove DJ role restriction").setEmoji("🔓").setStyle(ButtonStyle.Secondary)
    ));
  }
  rows.push(...controls(player, settings));
  return { components: [panel, ...rows] };
}

async function showQueue(interaction, player) {
  const tracks = player?.queue?.tracks || [];
  const lines = tracks.slice(0, 15).map((track, index) => "**" + (index + 1) + ".** " + titleOf(track) + " · " + duration(track.info?.duration));
  const current = player?.queue?.current;
  const container = new ContainerBuilder().setAccentColor(COLORS.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# 📜 LIGHTCORE • QUEUE\n" +
      (current ? "🎵 **Now playing:** " + titleOf(current) + "\n\n" : "") +
      (lines.join("\n") || "*No upcoming tracks.*") +
      (tracks.length > 15 ? "\n\n…and " + (tracks.length - 15) + " more tracks." : "") +
      "\n\n-# " + tracks.length + " upcoming track(s)"
    ));
  return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

export async function openMusicPanel({ client, message }) {
  if (!message.guild || !message.member) return;
  if (!client.music) return message.reply("The music manager is not ready yet.");
  let category = "playback";
  const sent = await message.reply({ ...buildPanel(client, message.guild, category), flags: MessageFlags.IsComponentsV2 });
  const collector = sent.createMessageComponentCollector();
  collector.on("collect", async interaction => {
    if (interaction.guildId !== message.guild.id) return interaction.reply({ content: "This panel belongs to another server.", ephemeral: true }).catch(() => {});
    const actor = await message.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actor) return interaction.reply({ content: "I could not verify your server membership.", ephemeral: true }).catch(() => {});
    const manager = client.music;
    let player = manager.getPlayer(message.guild.id);
    const settings = manager.getSettings(message.guild.id);
    const action = interaction.customId.split(":").at(-1);
    const isSettings = ["category", "setting", "djrole", "clear_dj", "volume_setting", "queue_setting", "source_setting", "loop_setting", "autoplay"].includes(action);
    if (isSettings && !actor.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "Only members with **Manage Server** can change music settings.", ephemeral: true }).catch(() => {});
    }
    const voice = actor.voice.channel;
    const isPlayback = !isSettings;
    if (isPlayback && action !== "autoplay") {
      if (!voice) return interaction.reply({ content: "Join a voice channel first to control playback.", ephemeral: true }).catch(() => {});
      if (player?.voiceChannelId && player.voiceChannelId !== voice.id) return interaction.reply({ content: "Join the same voice channel as LightCore to control playback.", ephemeral: true }).catch(() => {});
      if (!actor.permissions.has(PermissionFlagsBits.ManageGuild) && settings.djRoleId && !actor.roles.cache.has(settings.djRoleId)) {
        return interaction.reply({ content: "You need the configured DJ role <@&" + settings.djRoleId + "> to control music.", ephemeral: true }).catch(() => {});
      }
    }
    try {
      if (action === "category") {
        category = interaction.values[0];
      } else if (action === "setting") {
        const [key, value] = interaction.values[0].split(":");
        let patch = {};
        if (key === "defaultVolume") {
          const choices = [10, 25, 50, 70, 80, 100];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("aerox_panel:volume_setting").setPlaceholder("Choose the default volume")
            .addOptions(choices.map(n => ({ label: n + "%", value: String(n), default: n === settings.defaultVolume }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(category), row, ...controls(player, settings)] });
        }
        if (key === "maxQueue") {
          const choices = [25, 50, 100, 250, 500];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("aerox_panel:queue_setting").setPlaceholder("Choose the maximum queue size")
            .addOptions(choices.map(n => ({ label: n + " tracks", value: String(n), default: n === settings.maxQueue }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(category), row, ...controls(player, settings)] });
        }
        if (key === "defaultSource") {
          const choices = [{ label: "YouTube Music", value: "ytmsearch" }, { label: "YouTube", value: "ytsearch" }, { label: "SoundCloud", value: "scsearch" }];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("aerox_panel:source_setting").setPlaceholder("Choose the default search source").addOptions(choices.map(option => ({ ...option, default: option.value === settings.defaultSource }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(category), row, ...controls(player, settings)] });
        }
        if (key === "loop") {
          const choices = ["off", "track", "queue"];
          const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("aerox_panel:loop_setting").setPlaceholder("Choose the default repeat mode").addOptions(choices.map(mode => ({ label: mode === "off" ? "Off" : mode === "track" ? "Repeat track" : "Repeat queue", value: mode, default: mode === settings.loop }))));
          return interaction.update({ components: [buildPanel(client, message.guild, category).components[0], categoryMenu(category), row, ...controls(player, settings)] });
        }
        if (key === "autoplay" || key === "announceNowPlaying") patch[key] = value !== "on";
        if (Object.keys(patch).length) await manager.updateSettings(message.guild.id, patch);
      } else if (action === "volume_setting") {
        await manager.updateSettings(message.guild.id, { defaultVolume: Number(interaction.values[0]) });
      } else if (action === "queue_setting") {
        await manager.updateSettings(message.guild.id, { maxQueue: Number(interaction.values[0]) });
      } else if (action === "source_setting") {
        await manager.updateSettings(message.guild.id, { defaultSource: interaction.values[0] });
      } else if (action === "loop_setting") {
        await manager.updateSettings(message.guild.id, { loop: interaction.values[0] });
      } else if (action === "djrole") {
        await manager.updateSettings(message.guild.id, { djRoleId: interaction.values[0] });
        category = "access";
      } else if (action === "clear_dj") {
        await manager.updateSettings(message.guild.id, { djRoleId: null });
        category = "access";
      } else {
        if (!player && action !== "autoplay") return interaction.reply({ content: "No active player. Start music with .play first.", ephemeral: true }).catch(() => {});
        if (action === "toggle") player.paused ? await player.resume() : await player.pause();
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
        } else if (action === "loop") {
          const next = settings.loop === "off" ? "track" : settings.loop === "track" ? "queue" : "off";
          await manager.updateSettings(message.guild.id, { loop: next });
          if (typeof player.setRepeatMode === "function") await player.setRepeatMode(next);
        } else if (action === "shuffle") {
          if ((player.queue?.tracks?.length || 0) < 2) return interaction.reply({ content: "Add at least two upcoming tracks before shuffling.", ephemeral: true }).catch(() => {});
          await player.queue.shuffle();
        } else if (action === "autoplay") {
          await manager.updateSettings(message.guild.id, { autoplay: !settings.autoplay });
        }
      }
      await interaction.update(buildPanel(client, message.guild, category));
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
  const details = {
    playback: [
      "**Default volume:** " + settings.defaultVolume + "%",
      "**Search source:** " + settings.defaultSource,
      "**Default repeat:** " + settings.loop,
      "**Autoplay:** " + (settings.autoplay ? "Enabled" : "Disabled"),
      "",
      "These defaults apply to music sessions in this server."
    ].join("\n"),
    queue: [
      "**Maximum queue:** " + settings.maxQueue + " tracks",
      "**Autoplay:** " + (settings.autoplay ? "Enabled" : "Disabled"),
      "",
      "Queue limits are enforced when new tracks are requested."
    ].join("\n"),
    access: [
      "**DJ role:** " + (settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Not configured"),
      "**Administrator override:** Manage Server",
      "",
      "When a DJ role is set, playback controls require that role or Manage Server."
    ].join("\n"),
    display: [
      "**Now-playing announcements:** " + (settings.announceNowPlaying ? "Enabled" : "Disabled"),
      "",
      "Choose whether LightCore posts a Now Playing panel for each track."
    ].join("\n")
  }[category] || "";
  const container = new ContainerBuilder().setAccentColor(COLORS.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "# ⚙️ LIGHTCORE • SERVER MUSIC SETTINGS\n## " + clean(guild.name) +
      "\nConfigure your server’s music defaults. Changes are saved automatically in Neon."
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "### 🧭 " + category[0].toUpperCase() + category.slice(1) + " Configuration\n" + details
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LightCore Music • Server settings persist across redeploys"));
  const rows = [categoryMenu(category)];
  if (selection) {
    const options = selection === "volume"
      ? [10, 25, 50, 70, 80, 100].map(n => ({ label: n + "%", value: String(n), default: n === settings.defaultVolume }))
      : selection === "queue"
        ? [25, 50, 100, 250, 500].map(n => ({ label: n + " tracks", value: String(n), default: n === settings.maxQueue }))
        : selection === "source"
          ? [{ label: "YouTube Music", value: "ytmsearch" }, { label: "YouTube", value: "ytsearch" }, { label: "SoundCloud", value: "scsearch" }].map(o => ({ ...o, default: o.value === settings.defaultSource }))
          : ["off", "track", "queue"].map(mode => ({ label: mode === "off" ? "Off" : mode === "track" ? "Repeat track" : "Repeat queue", value: mode, default: mode === settings.loop }));
    const customId = selection === "volume" ? "aerox_panel:volume_setting" : selection === "queue" ? "aerox_panel:queue_setting" : selection === "source" ? "aerox_panel:source_setting" : "aerox_panel:loop_setting";
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId)
      .setPlaceholder(selection === "volume" ? "Choose default volume" : selection === "queue" ? "Choose queue limit" : selection === "source" ? "Choose search source" : "Choose default repeat mode")
      .addOptions(options)));
  } else {
    const menu = settingMenu(category, settings);
    if (menu) rows.push(menu);
  }
  if (category === "access") {
    rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
      .setCustomId("aerox_panel:djrole").setPlaceholder("Select the server DJ role")
      .setMinValues(1).setMaxValues(1)));
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId("aerox_panel:clear_dj").setLabel("Remove DJ role restriction")
      .setEmoji("🔓").setStyle(ButtonStyle.Secondary)));
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
  const collector = sent.createMessageComponentCollector({ time: 15 * 60_000 });
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
          await client.music.updateSettings(message.guild.id, { [key]: value !== "on" });
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
        await client.music.updateSettings(message.guild.id, { loop: interaction.values[0] });
        selection = null;
      } else if (action === "djrole") {
        await client.music.updateSettings(message.guild.id, { djRoleId: interaction.values[0] });
        category = "access";
        selection = null;
      } else if (action === "clear_dj") {
        await client.music.updateSettings(message.guild.id, { djRoleId: null });
        category = "access";
        selection = null;
      }
      await interaction.update(buildServerSettingsPanel(client, message.guild, category, selection));
    } catch (error) {
      const detail = clean(error?.message || error);
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: "Could not save that setting: " + detail, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: "Could not save that setting: " + detail, ephemeral: true }).catch(() => {});
    }
  });
  collector.on("end", () => sent.edit({ components: [buildServerSettingsPanel(client, message.guild, category, selection).components[0]] }).catch(() => {}));
  return sent;
}
