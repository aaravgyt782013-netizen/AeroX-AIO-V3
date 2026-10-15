import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder
} from "discord.js";

const safe = value => String(value ?? "").replace(/[@\\*_~`]/g, "").replace(/[\r\n]/g, " ").slice(0, 180);

function settingsEmbed(guild, settings) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎛️ LIGHTCORE • MUSIC CONTROL CENTER")
    .setDescription("Configure music playback for **" + safe(guild.name) + "**. Changes are saved to Neon.")
    .addFields(
      { name: "Default volume", value: settings.defaultVolume + "%", inline: true },
      { name: "Queue limit", value: String(settings.maxQueue), inline: true },
      { name: "Search source", value: settings.defaultSource, inline: true },
      { name: "Repeat", value: settings.loop, inline: true },
      { name: "Autoplay", value: settings.autoplay ? "Enabled" : "Disabled", inline: true },
      { name: "24/7 voice", value: settings.stay247 ? "Enabled" : "Disabled", inline: true },
      { name: "DJ role", value: settings.djRoleId ? "<@&" + settings.djRoleId + ">" : "Not configured", inline: true },
      { name: "Request channel", value: settings.requestChannelId ? "<#" + settings.requestChannelId + ">" : "Any text channel", inline: true },
      { name: "Voice restriction", value: settings.allowedVoiceChannelId ? "<#" + settings.allowedVoiceChannelId + ">" : "Any voice channel", inline: true },
      { name: "Now-playing channel", value: settings.announcementChannelId ? "<#" + settings.announcementChannelId + ">" : "Playback request channel", inline: true }
    )
    .setFooter({ text: "Manage Server permission required • LightCore" })
    .setTimestamp();
}

function settingsComponents(client, settings) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("lightcore_settings:select")
    .setPlaceholder("Choose a music setting")
    .addOptions(
      { label: "Default volume", value: "volume", description: "Choose the starting volume" },
      { label: "Queue limit", value: "queue", description: "Limit upcoming tracks" },
      { label: "Search source", value: "source", description: "Choose a search provider" },
      { label: "Repeat mode", value: "loop", description: "Off, track, or queue" },
      { label: "Toggle autoplay", value: "autoplay", description: "Recommend tracks when queue ends" },
      { label: "Toggle 24/7", value: "stay247", description: "Keep LightCore in its current voice channel" },
      { label: "Toggle now-playing announcements", value: "announce", description: "Enable or disable announcements" },
      { label: "Toggle artwork", value: "artwork", description: "Show album artwork on player" },
      { label: "Toggle requester", value: "requester", description: "Show who requested the track" }
    );
  const row = new ActionRowBuilder().addComponents(select);
  const roles = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
    .setCustomId("lightcore_settings:djrole")
    .setPlaceholder(settings.djRoleId ? "Change DJ role" : "Choose DJ role")
    .setMinValues(1).setMaxValues(1));
  const channels = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId("lightcore_settings:request_channel")
      .setPlaceholder("Set request text channel (optional)")
      .setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
    new ChannelSelectMenuBuilder().setCustomId("lightcore_settings:voice_channel")
      .setPlaceholder("Restrict music to voice channel (optional)")
      .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setMinValues(1).setMaxValues(1),
    new ChannelSelectMenuBuilder().setCustomId("lightcore_settings:announce_channel")
      .setPlaceholder("Set now-playing announcement channel")
      .setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lightcore_settings:clear_dj").setLabel("Clear DJ role").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lightcore_settings:clear_request").setLabel("Clear request restriction").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lightcore_settings:clear_voice").setLabel("Clear voice restriction").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lightcore_settings:clear_announce").setLabel("Clear announcement channel").setStyle(ButtonStyle.Secondary)
  );
  return [row, roles, channels, actions];
}

export async function openMusicPanel({ client, message }) {
  if (!message?.guild || !message.member) return;
  const manager = client.music;
  if (!manager) return message.reply("The music engine is not ready yet.");
  const guildId = message.guild.id;
  const player = manager.getPlayer(guildId);
  if (player) {
    const published = await manager.publishPlayer(player);
    if (published) return published;
  }
  const sent = await message.reply({
    embeds: [manager.playerEmbed({ guildId, queue: { tracks: [] }, volume: manager.getSettings(guildId).defaultVolume })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lightcore:dashboard").setLabel("Music settings").setEmoji("🎛️").setStyle(ButtonStyle.Success)
    )]
  });
  const collector = sent.createMessageComponentCollector({ idle: 30 * 60 * 1000 });
  collector.on("collect", async interaction => {
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({ content: "Run the music panel command yourself to use this control.", ephemeral: true }).catch(() => {});
    }
    await manager.handleControl(interaction, guildId);
  });
  collector.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  return sent;
}

export async function openMusicSettingsPanel({ client, message, interaction, member }) {
  const guild = interaction?.guild || message?.guild;
  const actor = member || interaction?.member || message?.member;
  if (!guild || !actor) return;
  if (!actor.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    const payload = { content: "Only members with **Manage Server** can change server music settings.", ephemeral: true };
    if (interaction) return interaction.reply(payload).catch(() => {});
    return message.reply(payload.content);
  }
  const manager = client.music;
  if (!manager) {
    if (interaction) return interaction.reply({ content: "The music engine is not ready yet.", ephemeral: true });
    return message.reply("The music engine is not ready yet.");
  }

  const payload = {
    embeds: [settingsEmbed(guild, manager.getSettings(guild.id))],
    components: settingsComponents(client, manager.getSettings(guild.id))
  };
  let sent;
  if (interaction) {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    sent = await interaction.fetchReply();
  } else {
    sent = await message.reply(payload);
  }

  const collector = sent.createMessageComponentCollector({ idle: 10 * 60 * 1000 });
  collector.on("collect", async control => {
    if (control.user.id !== actor.id) {
      return control.reply({ content: "Open your own settings panel to change server music settings.", ephemeral: true }).catch(() => {});
    }
    const freshMember = await guild.members.fetch(control.user.id).catch(() => null);
    if (!freshMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return control.reply({ content: "Manage Server permission is required.", ephemeral: true }).catch(() => {});
    }
    const current = manager.getSettings(guild.id);
    try {
      const [scope, action] = control.customId.split(":");
      if (scope !== "lightcore_settings") return;
      let patch = {};
      if (control.isStringSelectMenu()) {
        const selected = control.values[0];
        if (action === "select") {
          if (selected === "volume") {
            const menu = new StringSelectMenuBuilder().setCustomId("lightcore_settings:set_volume").setPlaceholder("Choose default volume")
              .addOptions([10,25,40,50,60,70,80,90,100].map(n => ({ label: n + "%", value: String(n), default: n === current.defaultVolume })));
            return control.update({ embeds: [settingsEmbed(guild, current)], components: [new ActionRowBuilder().addComponents(menu), ...settingsComponents(client, current).slice(1)] });
          }
          if (selected === "queue") {
            const menu = new StringSelectMenuBuilder().setCustomId("lightcore_settings:set_queue").setPlaceholder("Choose queue limit")
              .addOptions([25,50,100,150,250,500].map(n => ({ label: n + " tracks", value: String(n), default: n === current.maxQueue })));
            return control.update({ embeds: [settingsEmbed(guild, current)], components: [new ActionRowBuilder().addComponents(menu), ...settingsComponents(client, current).slice(1)] });
          }
          if (selected === "source") {
            const menu = new StringSelectMenuBuilder().setCustomId("lightcore_settings:set_source").setPlaceholder("Choose search source")
              .addOptions([{label:"YouTube Music",value:"ytmsearch"},{label:"YouTube",value:"ytsearch"},{label:"SoundCloud",value:"scsearch"}].map(o=>({...o,default:o.value===current.defaultSource})));
            return control.update({ embeds: [settingsEmbed(guild, current)], components: [new ActionRowBuilder().addComponents(menu), ...settingsComponents(client, current).slice(1)] });
          }
          if (selected === "loop") {
            const menu = new StringSelectMenuBuilder().setCustomId("lightcore_settings:set_loop").setPlaceholder("Choose repeat mode")
              .addOptions(["off","track","queue"].map(mode=>({label:mode==="off"?"Off":mode==="track"?"Repeat track":"Repeat queue",value:mode,default:mode===current.loop})));
            return control.update({ embeds: [settingsEmbed(guild, current)], components: [new ActionRowBuilder().addComponents(menu), ...settingsComponents(client, current).slice(1)] });
          }
          if (selected === "autoplay") patch = { autoplay: !current.autoplay, ...(!current.autoplay ? { loop: "off" } : {}) };
          else if (selected === "stay247") {
            const player = manager.getPlayer(guild.id);
            if (!current.stay247 && !player?.voiceChannelId) return control.reply({ content: "Start playback first so LightCore knows which voice channel to stay in.", ephemeral: true });
            patch = current.stay247
              ? { stay247: false, stay247VoiceChannelId: null, stay247TextChannelId: null }
              : { stay247: true, stay247VoiceChannelId: player.voiceChannelId, stay247TextChannelId: player.textChannelId || null };
          } else if (selected === "announce") patch = { announceNowPlaying: !current.announceNowPlaying };
          else if (selected === "artwork") patch = { showArtwork: !current.showArtwork };
          else if (selected === "requester") patch = { showRequester: !current.showRequester };
        } else if (action === "set_volume") patch = { defaultVolume: Number(selected) };
        else if (action === "set_queue") patch = { maxQueue: Number(selected) };
        else if (action === "set_source") patch = { defaultSource: selected };
        else if (action === "set_loop") patch = { loop: selected, ...(selected !== "off" ? { autoplay: false } : {}) };
      } else if (control.isRoleSelectMenu() && action === "djrole") patch = { djRoleId: control.values[0] };
      else if (control.isChannelSelectMenu() && action === "request_channel") patch = { requestChannelId: control.values[0] };
      else if (control.isChannelSelectMenu() && action === "voice_channel") patch = { allowedVoiceChannelId: control.values[0] };
      else if (control.isChannelSelectMenu() && action === "announce_channel") patch = { announcementChannelId: control.values[0] };
      else if (action === "clear_dj") patch = { djRoleId: null };
      else if (action === "clear_request") patch = { requestChannelId: null };
      else if (action === "clear_voice") patch = { allowedVoiceChannelId: null };
      else if (action === "clear_announce") patch = { announcementChannelId: null };
      else return control.reply({ content: "Unknown setting action.", ephemeral: true });

      if (Object.keys(patch).length) {
        const updated = await manager.updateSettings(guild.id, patch);
        const player = manager.getPlayer(guild.id);
        if (player && patch.defaultVolume !== undefined) await player.setVolume(patch.defaultVolume);
        if (player && patch.loop !== undefined) await player.setRepeatMode?.(patch.loop);
        await control.update({ embeds: [settingsEmbed(guild, updated)], components: settingsComponents(client, updated) });
      }
    } catch (error) {
      const text = safe(error?.message || error);
      if (control.deferred || control.replied) await control.followUp({ content: "Could not save that setting: " + text, ephemeral: true }).catch(() => {});
      else await control.reply({ content: "Could not save that setting: " + text, ephemeral: true }).catch(() => {});
    }
  });
  collector.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  return sent;
}
