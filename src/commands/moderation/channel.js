import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

const TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
  category: ChannelType.GuildCategory,
};

const TYPE_LABELS = {
  [ChannelType.GuildText]: "Text",
  [ChannelType.GuildVoice]: "Voice",
  [ChannelType.GuildAnnouncement]: "Announcement",
  [ChannelType.GuildForum]: "Forum",
  [ChannelType.GuildStageVoice]: "Stage",
  [ChannelType.GuildCategory]: "Category",
};

const PERMISSION_MAP = {
  viewchannel: "ViewChannel",
  sendmessages: "SendMessages",
  readmessagehistory: "ReadMessageHistory",
  embedlinks: "EmbedLinks",
  attachfiles: "AttachFiles",
  addreactions: "AddReactions",
  createpublicthreads: "CreatePublicThreads",
  createprivatethreads: "CreatePrivateThreads",
  sendmessagesinthreads: "SendMessagesInThreads",
  connect: "Connect",
  speak: "Speak",
  stream: "Stream",
  usevad: "UseVAD",
  managechannels: "ManageChannels",
  managewebhooks: "ManageWebhooks",
  mentioneveryone: "MentionEveryone",
};

function cleanName(value) {
  return String(value || "").trim().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 100);
}

function resolveChannel(guild, value, fallback = null) {
  if (!value) return fallback;
  const raw = String(value);
  const id = raw.match(/^<#(\d+)>$/)?.[1] || raw.match(/^(\d{15,25})$/)?.[1];
  if (id) return guild.channels.cache.get(id) || null;
  const normalized = raw.toLowerCase();
  return guild.channels.cache.find(c => c.name.toLowerCase() === normalized) || null;
}

function resolveCategory(guild, value) {
  const channel = resolveChannel(guild, value);
  return channel?.type === ChannelType.GuildCategory ? channel : null;
}

function channelMention(channel) {
  return channel?.toString?.() || ("#" + (channel?.name || "unknown"));
}

function typeName(type) {
  return TYPE_LABELS[type] || "Channel";
}

function errorEmbed(message) {
  return new EmbedBuilder().setColor(0xED4245).setTitle("❌ Channel Manager").setDescription(message);
}

function successEmbed(title, description) {
  return new EmbedBuilder().setColor(0x57F287).setTitle("🛠️ " + title).setDescription(description);
}

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🛠️ LightCore Channel Manager")
    .setDescription("A full Discord channel-management toolkit for owners and moderators.")
    .addFields(
      { name: "🏗️ Create", value: ".channel create <name> [text|voice|announcement|forum|stage|category] [category]\n.channel clone <channel> [new-name]" },
      { name: "✏️ Edit", value: ".channel rename <channel> <name>\n.channel topic <channel> <topic>\n.channel slowmode <channel> <seconds>\n.channel move <channel> <category>\n.channel nsfw <channel> <on|off>" },
      { name: "🔐 Access", value: ".channel lock [channel]\n.channel unlock [channel]\n.channel hide [channel]\n.channel show [channel]\n.channel permission <channel> <@role|@user> <allow|deny> <permission>" },
      { name: "🗑️ Manage", value: ".channel delete <channel>\n.channel info [channel]\n.channel list" }
    )
    .setFooter({ text: "LightCore • Channel Manager" });
}

function ensureManageChannels(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageChannels);
}

function ensureBotManageChannels(guild) {
  return guild.members.me?.permissions?.has(PermissionFlagsBits.ManageChannels);
}

function resolveTarget(guild, token) {
  const roleId = String(token || "").match(/^<@&(\d+)>$/)?.[1];
  if (roleId) return guild.roles.cache.get(roleId) || null;
  const userId = String(token || "").match(/^<@!?(\\d+)>$/)?.[1];
  if (userId) return guild.members.cache.get(userId)?.user || null;
  const id = String(token || "").match(/^(\\d{15,25})$/)?.[1];
  return id ? (guild.roles.cache.get(id) || guild.members.cache.get(id)?.user || null) : null;
}

async function runAction({ guild, member, subcommand, channel, args }) {
  if (!ensureManageChannels(member)) {
    return { embeds: [errorEmbed("You need the **Manage Channels** permission to use Channel Manager.")] };
  }
  if (!ensureBotManageChannels(guild)) {
    return { embeds: [errorEmbed("I need the **Manage Channels** permission to manage channels.")] };
  }

  const reason = "LightCore Channel Manager • " + (member.user?.tag || member.tag || "Moderator");

  if (subcommand === "list") {
    const grouped = new Map();
    guild.channels.cache.filter(c => !c.isThread()).sort((a, b) => a.rawPosition - b.rawPosition).forEach(c => {
      const parent = c.parent?.name || "No Category";
      if (!grouped.has(parent)) grouped.set(parent, []);
      grouped.get(parent).push(channelMention(c) + " • " + typeName(c.type));
    });
    const fields = Array.from(grouped.entries()).slice(0, 20).map(([name, channels]) => ({
      name: "📁 " + name,
      value: channels.slice(0, 15).join("\n") || "Empty",
    }));
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("📚 Channel List")
          .setDescription("Showing " + guild.channels.cache.filter(c => !c.isThread()).size + " guild channels.")
          .addFields(fields.length ? fields : [{ name: "Channels", value: "No channels found." }]),
      ],
    };
  }

  if (subcommand === "create") {
    const name = cleanName(args[1]);
    const typeKey = String(args[2] || "text").toLowerCase();
    const type = TYPE_MAP[typeKey];
    const parent = args[3] ? resolveCategory(guild, args[3]) : null;

    if (!name) return { embeds: [errorEmbed("Usage: .channel create <name> [type] [category]")] };
    if (!type) return { embeds: [errorEmbed("Invalid type. Use text, voice, announcement, forum, stage, or category.")] };
    if (args[3] && !parent) return { embeds: [errorEmbed("That category could not be found.")] };

    const options = { name, type, reason };
    if (parent && type !== ChannelType.GuildCategory) options.parent = parent.id;

    const created = await guild.channels.create(options);
    return { embeds: [successEmbed("Channel Created", "Created " + channelMention(created) + " • **" + typeName(created.type) + "**" + (parent ? " in **" + parent.name + "**." : "."))] };
  }

  if (!channel) {
    return { embeds: [errorEmbed("Please mention a channel, provide its ID, or use the current channel where supported.")] };
  }

  if (!channel.manageable && subcommand !== "info") {
    return { embeds: [errorEmbed("I cannot manage " + channelMention(channel) + " because of Discord's role/permission hierarchy.")] };
  }

  if (subcommand === "info") {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("🔎 Channel Info • " + channel.name)
          .addFields(
            { name: "Channel", value: channelMention(channel) + "\n" + channel.id, inline: true },
            { name: "Type", value: typeName(channel.type), inline: true },
            { name: "Category", value: channel.parent?.name || "None", inline: true },
            { name: "Position", value: String(channel.position), inline: true },
            { name: "NSFW", value: "nsfw" in channel ? (channel.nsfw ? "Enabled" : "Disabled") : "N/A", inline: true },
            { name: "Slowmode", value: "rateLimitPerUser" in channel ? String(channel.rateLimitPerUser || 0) + "s" : "N/A", inline: true },
            { name: "Created", value: "<t:" + Math.floor(channel.createdTimestamp / 1000) + ":R>", inline: true },
          ),
      ],
    };
  }

  if (subcommand === "delete") {
    const name = channel.name;
    await channel.delete(reason);
    return { embeds: [successEmbed("Channel Deleted", "Deleted **#" + name + "**.")] };
  }

  if (subcommand === "clone") {
    const newName = cleanName(args[2]) || (channel.name + "-copy");
    const cloned = await channel.clone({ name: newName, reason });
    return { embeds: [successEmbed("Channel Cloned", "Created " + channelMention(cloned) + " from " + channelMention(channel) + ".")] };
  }

  if (subcommand === "rename") {
    const newName = cleanName(args[2]);
    if (!newName) return { embeds: [errorEmbed("Usage: .channel rename <channel> <new-name>")] };
    await channel.setName(newName, reason);
    return { embeds: [successEmbed("Channel Renamed", "Renamed the channel to " + channelMention(channel) + ".")] };
  }

  if (subcommand === "topic") {
    if (!("setTopic" in channel)) return { embeds: [errorEmbed("This channel type does not support a topic.")] };
    const topic = args.slice(2).join(" ").slice(0, 1024);
    if (!topic) return { embeds: [errorEmbed("Usage: .channel topic <channel> <topic>")] };
    await channel.setTopic(topic, reason);
    return { embeds: [successEmbed("Topic Updated", "Updated the topic for " + channelMention(channel) + ".")] };
  }

  if (subcommand === "slowmode") {
    if (!("setRateLimitPerUser" in channel)) return { embeds: [errorEmbed("This channel does not support slowmode.")] };
    const seconds = Number(args[2]);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      return { embeds: [errorEmbed("Slowmode must be a whole number from 0 to 21600 seconds.")] };
    }
    await channel.setRateLimitPerUser(seconds, reason);
    return { embeds: [successEmbed("Slowmode Updated", channelMention(channel) + " slowmode is now **" + seconds + "s**.")] };
  }

  if (subcommand === "lock" || subcommand === "unlock") {
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages: subcommand === "unlock" ? null : false },
      { reason }
    );
    return { embeds: [successEmbed(subcommand === "lock" ? "Channel Locked" : "Channel Unlocked", channelMention(channel) + " is now **" + (subcommand === "lock" ? "locked" : "unlocked") + "** for @everyone.")] };
  }

  if (subcommand === "hide" || subcommand === "show") {
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { ViewChannel: subcommand === "show" ? null : false },
      { reason }
    );
    return { embeds: [successEmbed(subcommand === "hide" ? "Channel Hidden" : "Channel Visible", channelMention(channel) + " is now **" + (subcommand === "hide" ? "hidden" : "visible") + "** for @everyone.")] };
  }

  if (subcommand === "move") {
    const category = resolveCategory(guild, args[2]);
    if (!category) return { embeds: [errorEmbed("That category could not be found.")] };
    await channel.setParent(category.id, { lockPermissions: false });
    return { embeds: [successEmbed("Channel Moved", "Moved " + channelMention(channel) + " to **" + category.name + "**.")] };
  }

  if (subcommand === "nsfw") {
    if (!("setNSFW" in channel)) return { embeds: [errorEmbed("This channel type does not support NSFW settings.")] };
    const value = String(args[2] || "").toLowerCase();
    if (!["on", "off", "true", "false"].includes(value)) return { embeds: [errorEmbed("Usage: .channel nsfw <channel> <on|off>")] };
    const enabled = value === "on" || value === "true";
    await channel.setNSFW(enabled, reason);
    return { embeds: [successEmbed("NSFW Updated", channelMention(channel) + " NSFW is now **" + (enabled ? "enabled" : "disabled") + "**.")] };
  }

  if (subcommand === "permission") {
    const targetToken = args[2];
    const mode = String(args[3] || "").toLowerCase();
    const permissionKey = String(args[4] || "").toLowerCase();
    const permission = PERMISSION_MAP[permissionKey];

    if (!targetToken || !["allow", "deny"].includes(mode) || !permission) {
      return { embeds: [errorEmbed("Usage: .channel permission <channel> <@role|@user> <allow|deny> <permission>")] };
    }

    const target = resolveTarget(guild, targetToken);
    if (!target) return { embeds: [errorEmbed("Mention a role/user or provide a valid role/user ID.")] };

    await channel.permissionOverwrites.edit(target, { [permission]: mode === "allow" }, { reason });
    return { embeds: [successEmbed("Permission Updated", channelMention(channel) + " • " + targetToken + " • **" + permission + "** → **" + mode + "**")] };
  }

  return { embeds: [helpEmbed()] };
}

function getSlashChannel(interaction) {
  return interaction.options.getChannel("channel") || interaction.channel;
}

export default {
  name: "channel",
  description: "Full Discord channel management system",
  usage: "channel <create|delete|clone|rename|topic|slowmode|lock|unlock|hide|show|move|nsfw|permission|info|list>",
  aliases: ["ch", "channelmanager"],
  category: "moderation",
  cooldown: 2,
  userPermissions: [PermissionFlagsBits.ManageChannels],
  permissions: [PermissionFlagsBits.ManageChannels],
  enabledSlash: true,

  slashData: {
    name: ["channel", "create"],
    description: "Create a new channel",
    groupDescription: "Channel Manager",
    options: [
      { name: "name", description: "Channel name", type: 3, required: true },
      { name: "type", description: "Channel type", type: 3, required: false, choices: [
        { name: "Text", value: "text" },
        { name: "Voice", value: "voice" },
        { name: "Announcement", value: "announcement" },
        { name: "Forum", value: "forum" },
        { name: "Stage", value: "stage" },
        { name: "Category", value: "category" },
      ]},
      { name: "category", description: "Parent category", type: 7, required: false, channel_types: [ChannelType.GuildCategory] },
    ],
  },

  async execute({ message, args }) {
    const subcommand = String(args[0] || "").toLowerCase();
    if (!subcommand) return message.reply({ embeds: [helpEmbed()] });

    let channelToken = null;
    const channelFirst = ["delete", "clone", "rename", "topic", "slowmode", "lock", "unlock", "hide", "show", "move", "nsfw", "permission", "info"].includes(subcommand);
    if (channelFirst) channelToken = args[1];

    const channel = ["lock", "unlock", "hide", "show", "info"].includes(subcommand)
      ? resolveChannel(message.guild, channelToken, message.channel)
      : resolveChannel(message.guild, channelToken);

    try {
      return await runAction({ guild: message.guild, member: message.member, subcommand, channel, args });
    } catch (error) {
      return message.reply({ embeds: [errorEmbed("Operation failed: **" + (error?.message || error) + "**")] });
    }
  },

  async slashExecute({ interaction }) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "create") {
        const name = cleanName(interaction.options.getString("name"));
        const typeKey = interaction.options.getString("type") || "text";
        const type = TYPE_MAP[typeKey];
        const parent = interaction.options.getChannel("category");

        if (!ensureManageChannels(interaction.member)) {
          return interaction.reply({ embeds: [errorEmbed("You need **Manage Channels** to use Channel Manager.")], ephemeral: true });
        }
        if (!ensureBotManageChannels(interaction.guild)) {
          return interaction.reply({ embeds: [errorEmbed("I need **Manage Channels** to manage channels.")], ephemeral: true });
        }
        if (!name || !type) return interaction.reply({ embeds: [errorEmbed("Invalid channel name or type.")], ephemeral: true });
        if (parent && parent.type !== ChannelType.GuildCategory) return interaction.reply({ embeds: [errorEmbed("The parent must be a category.")], ephemeral: true });

        const options = { name, type, reason: "LightCore Channel Manager • " + interaction.user.tag };
        if (parent && type !== ChannelType.GuildCategory) options.parent = parent.id;
        const created = await interaction.guild.channels.create(options);
        return interaction.reply({ embeds: [successEmbed("Channel Created", "Created " + channelMention(created) + " • **" + typeName(created.type) + "**.")] });
      }

      if (sub === "list") {
        return interaction.reply(await runAction({ guild: interaction.guild, member: interaction.member, subcommand: sub, channel: null, args: [sub] }));
      }

      const channel = getSlashChannel(interaction);
      const args = [sub, channel?.id];

      if (sub === "clone") args.push(interaction.options.getString("name") || "");
      if (sub === "rename") args.push(interaction.options.getString("name") || "");
      if (sub === "topic") args.push(interaction.options.getString("topic") || "");
      if (sub === "slowmode") args.push(String(interaction.options.getInteger("seconds") ?? 0));
      if (sub === "move") args.push(interaction.options.getChannel("category")?.id || "");
      if (sub === "nsfw") args.push(interaction.options.getString("state") || "");
      if (sub === "permission") {
        const target = interaction.options.getMentionable("target");
        args.push(target?.id || "", interaction.options.getString("mode") || "", interaction.options.getString("permission") || "");
      }

      return interaction.reply(await runAction({ guild: interaction.guild, member: interaction.member, subcommand: sub, channel, args }));
    } catch (error) {
      const payload = { embeds: [errorEmbed("Operation failed: **" + (error?.message || error) + "**")] };
      if (interaction.replied || interaction.deferred) return interaction.followUp({ ...payload, ephemeral: true });
      return interaction.reply({ ...payload, ephemeral: true });
    }
  },
};