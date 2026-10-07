import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { automationPlaceholderHelp, renderAutomationMessage } from "#utils/AutomationUtils";

const DEFAULT_MESSAGE = "Welcome {user} to **{server}**! You are member **#{membercount}**.";

function replyBox(content) {
  const embed = new EmbedBuilder()
    .setTitle("👋 Welcome Setup")
    .setDescription(content)
    .setColor(0x5865F2)
    .setTimestamp();
  return { embeds: [embed] };
}

function resolveChannel(message, raw) {
  const mentioned = message.mentions.channels.first();
  if (mentioned) return mentioned;
  const id = String(raw || "").match(/^\d{17,20}$/)?.[0];
  return id ? message.guild.channels.cache.get(id) || null : null;
}

class WelcomeCommand extends Command {
  constructor() {
    super({
      name: "welcome",
      description: "Configure automatic member welcome messages",
      usage: "welcome <setup|message|channel|view|test|off|placeholders>",
      aliases: ["welcomer"],
      category: "Utility",
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.SendMessages],
      enabledSlash: true,
      slashData: {
        name: ["welcome", "setup"],
        groupDescription: "Configure automatic welcome messages.",
        description: "Set the welcome channel and message.",
        options: [
          { name: "channel", description: "Channel where welcomes are sent.", type: 7, required: true, channel_types: [0, 5] },
          { name: "message", description: "Welcome message with placeholders.", type: 3, required: true },
        ],
      },
    });
  }

  async execute({ message, args }) {
    const sub = (args[0] || "view").toLowerCase();
    const guildId = message.guild.id;

    if (sub === "setup") {
      const channel = resolveChannel(message, args[1]);
      const text = args.slice(2).join(" ") || DEFAULT_MESSAGE;
      if (!channel) return message.reply(replyBox(emoji.get("cross") + " Mention a text channel or provide its ID."));
      db.setWelcome(guildId, channel.id, text);
      return message.reply(replyBox(emoji.get("check") + " Welcome messages are enabled in <#" + channel.id + ">.\n\n**Message:**\n" + text));
    }

    if (sub === "message") {
      const text = args.slice(1).join(" ");
      const current = db.getWelcome(guildId);
      if (!text) return message.reply(replyBox(emoji.get("cross") + " Provide a welcome message."));
      if (!current) return message.reply(replyBox(emoji.get("cross") + " Run .welcome setup #channel message first."));
      db.setWelcome(guildId, current.channel_id, text);
      return message.reply(replyBox(emoji.get("check") + " Welcome message updated."));
    }

    if (sub === "channel") {
      const channel = resolveChannel(message, args[1]);
      const current = db.getWelcome(guildId);
      if (!channel || !current) return message.reply(replyBox(emoji.get("cross") + " Run .welcome setup #channel message first."));
      db.setWelcome(guildId, channel.id, current.message);
      return message.reply(replyBox(emoji.get("check") + " Welcome channel changed to <#" + channel.id + ">."));
    }

    if (sub === "test") {
      const current = db.getWelcome(guildId);
      if (!current?.enabled) return message.reply(replyBox(emoji.get("cross") + " Welcome messages are not enabled."));
      const channel = message.guild.channels.cache.get(current.channel_id);
      if (!channel || !channel.isTextBased()) return message.reply(replyBox(emoji.get("cross") + " The configured welcome channel no longer exists."));
      const rendered = renderAutomationMessage(current.message, { member: message.member, guild: message.guild, channel });
      await channel.send({ content: rendered, allowedMentions: { parse: ["users", "roles"] } });
      return message.reply(replyBox(emoji.get("check") + " Welcome test sent to <#" + channel.id + ">."));
    }

    if (sub === "off" || sub === "disable") {
      db.disableWelcome(guildId);
      return message.reply(replyBox(emoji.get("check") + " Welcome messages are now disabled."));
    }

    if (sub === "placeholders" || sub === "variables") {
      return message.reply(replyBox("**Welcome placeholders**\n\n" + automationPlaceholderHelp()));
    }

    const current = db.getWelcome(guildId);
    if (!current || !current.enabled) {
      return message.reply(replyBox(emoji.get("info") + " Welcome messages are disabled.\n\nUse .welcome setup #welcome Welcome {user} to {server}! to enable them."));
    }

    return message.reply(replyBox(
      "**Welcome Setup**\n\n**Channel:** <#" + current.channel_id + ">\n**Message:**\n" + current.message +
      "\n\nUse .welcome test to preview it or .welcome placeholders for variables."
    ));
  }

  async slashExecute({ interaction }) {
    const channel = interaction.options.getChannel("channel");
    const text = interaction.options.getString("message");
    db.setWelcome(interaction.guild.id, channel.id, text);
    return interaction.reply(replyBox(emoji.get("check") + " Welcome messages are enabled in <#" + channel.id + ">.\n\n**Message:**\n" + text));
  }
}

export default new WelcomeCommand();
