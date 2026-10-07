import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { automationPlaceholderHelp, renderAutomationMessage } from "#utils/AutomationUtils";

const DEFAULT_MESSAGE = "Goodbye {username}! We will miss you from **{server}**.";

function replyBox(content) {
  return {
    components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

function resolveChannel(message, raw) {
  const mentioned = message.mentions.channels.first();
  if (mentioned) return mentioned;
  const id = String(raw || "").match(/^\d{17,20}$/)?.[0];
  return id ? message.guild.channels.cache.get(id) || null : null;
}

class LeaveCommand extends Command {
  constructor() {
    super({
      name: "leave",
      description: "Configure automatic member leave messages",
      usage: "leave <setup|message|channel|view|test|off|placeholders>",
      aliases: ["leavemsg", "goodbye"],
      category: "Utility",
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.SendMessages],
      enabledSlash: true,
      slashData: {
        name: ["leave", "setup"],
        groupDescription: "Configure automatic leave messages.",
        description: "Set the leave channel and message.",
        options: [
          { name: "channel", description: "Channel where leave messages are sent.", type: 7, required: true, channel_types: [0, 5] },
          { name: "message", description: "Leave message with placeholders.", type: 3, required: true },
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
      db.setLeave(guildId, channel.id, text);
      return message.reply(replyBox(emoji.get("check") + " Leave messages are enabled in <#" + channel.id + ">.

**Message:**
" + text));
    }

    if (sub === "message") {
      const text = args.slice(1).join(" ");
      const current = db.getLeave(guildId);
      if (!text) return message.reply(replyBox(emoji.get("cross") + " Provide a leave message."));
      if (!current) return message.reply(replyBox(emoji.get("cross") + " Run .leave setup #channel message first."));
      db.setLeave(guildId, current.channel_id, text);
      return message.reply(replyBox(emoji.get("check") + " Leave message updated."));
    }

    if (sub === "channel") {
      const channel = resolveChannel(message, args[1]);
      const current = db.getLeave(guildId);
      if (!channel || !current) return message.reply(replyBox(emoji.get("cross") + " Run .leave setup #channel message first."));
      db.setLeave(guildId, channel.id, current.message);
      return message.reply(replyBox(emoji.get("check") + " Leave channel changed to <#" + channel.id + ">."));
    }

    if (sub === "test") {
      const current = db.getLeave(guildId);
      if (!current?.enabled) return message.reply(replyBox(emoji.get("cross") + " Leave messages are not enabled."));
      const channel = message.guild.channels.cache.get(current.channel_id);
      if (!channel || !channel.isTextBased()) return message.reply(replyBox(emoji.get("cross") + " The configured leave channel no longer exists."));
      const rendered = renderAutomationMessage(current.message, { member: message.member, guild: message.guild, channel });
      await channel.send({ content: rendered, allowedMentions: { parse: ["users", "roles"] } });
      return message.reply(replyBox(emoji.get("check") + " Leave test sent to <#" + channel.id + ">."));
    }

    if (sub === "off" || sub === "disable") {
      db.disableLeave(guildId);
      return message.reply(replyBox(emoji.get("check") + " Leave messages are now disabled."));
    }

    if (sub === "placeholders" || sub === "variables") {
      return message.reply(replyBox("**Leave placeholders**

" + automationPlaceholderHelp()));
    }

    const current = db.getLeave(guildId);
    if (!current || !current.enabled) {
      return message.reply(replyBox(emoji.get("info") + " Leave messages are disabled.

Use .leave setup #goodbye Goodbye {username}! to enable them."));
    }

    return message.reply(replyBox(
      "**Leave Setup**

**Channel:** <#" + current.channel_id + ">
**Message:**
" + current.message +
      "

Use .leave test to preview it or .leave placeholders for variables."
    ));
  }

  async slashExecute({ interaction }) {
    const channel = interaction.options.getChannel("channel");
    const text = interaction.options.getString("message");
    db.setLeave(interaction.guild.id, channel.id, text);
    return interaction.reply(replyBox(emoji.get("check") + " Leave messages are enabled in <#" + channel.id + ">.

**Message:**
" + text));
  }
}

export default new LeaveCommand();
