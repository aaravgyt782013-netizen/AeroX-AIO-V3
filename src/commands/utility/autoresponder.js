import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { automationPlaceholderHelp, renderAutomationMessage } from "#utils/AutomationUtils";

function replyBox(content) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("🤖 LightCore • Autoresponder")
        .setDescription(content)
        .setColor(0x5865F2)
        .setTimestamp(),
    ],
  };
}

function parseRule(raw, allowMode = false) {
  let input = String(raw || "").trim();
  let matchType = "contains";
  if (allowMode && /^exact\s+/i.test(input)) {
    matchType = "exact";
    input = input.replace(/^exact\s+/i, "");
  }
  const separator = input.indexOf("|");
  if (separator === -1) return null;
  const trigger = input.slice(0, separator).trim();
  const response = input.slice(separator + 1).trim();
  return trigger && response ? { trigger, response, matchType } : null;
}

function findRule(guildId, raw) {
  const value = String(raw || "").trim();
  const id = Number(value);
  return Number.isInteger(id) && id > 0
    ? db.getAutoresponder(guildId, id)
    : db.findAutoresponder(guildId, value);
}

class AutoResponderCommand extends Command {
  constructor() {
    super({
      name: "autoresponder",
      description: "Create Mimu-style automatic replies to messages",
      usage: "autoresponder <add|edit|remove|enable|disable|test|list|clear|placeholders>",
      aliases: ["ar", "autoresponse", "autorespond"],
      category: "Utility",
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.SendMessages],
      enabledSlash: true,
      slashData: {
        name: ["autoresponder", "add"],
        groupDescription: "Configure automatic message responses.",
        description: "Add an autoresponder.",
        options: [
          { name: "trigger", description: "Text that activates the response.", type: 3, required: true },
          { name: "response", description: "Reply text with placeholders.", type: 3, required: true },
          { name: "match", description: "How the trigger is matched.", type: 3, required: false, choices: [
            { name: "Contains", value: "contains" },
            { name: "Exact", value: "exact" }
          ] },
        ],
      },
    });
  }

  async execute({ message, args }) {
    const sub = (args[0] || "list").toLowerCase();
    const guildId = message.guild.id;

    if (sub === "add") {
      const rule = parseRule(args.slice(1).join(" "), true);
      if (!rule) {
        return message.reply(replyBox(
          emoji.get("cross") +
          " Use: .autoresponder add [exact] trigger | response\n" +
          "Example: .autoresponder add hello | Hey {user}!\n" +
          "Tip: use exact when you only want a response to the whole message."
        ));
      }
      try {
        db.addAutoresponder(guildId, rule.trigger, rule.response, rule.matchType);
        const created = db.findAutoresponder(guildId, rule.trigger);
        return message.reply(replyBox(
          emoji.get("check") + " Autoresponder #" + (created?.id || "?") + " created.\n\n" +
          "**Trigger:** " + rule.trigger +
          "\n**Match:** " + rule.matchType +
          "\n**Response:** " + rule.response
        ));
      } catch (error) {
        if (String(error.message).toLowerCase().includes("unique")) {
          return message.reply(replyBox(emoji.get("cross") + " That trigger already exists. Use .autoresponder edit <id> | new response."));
        }
        throw error;
      }
    }

    if (sub === "edit") {
      const rule = parseRule(args.slice(1).join(" "));
      if (!rule) return message.reply(replyBox(emoji.get("cross") + " Use: .autoresponder edit <id> | new response"));
      const found = findRule(guildId, rule.trigger);
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      db.updateAutoresponder(guildId, found.id, rule.response);
      return message.reply(replyBox(emoji.get("check") + " Autoresponder #" + found.id + " updated and enabled."));
    }

    if (sub === "remove" || sub === "delete") {
      const found = findRule(guildId, args.slice(1).join(" "));
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      db.deleteAutoresponder(guildId, found.id);
      return message.reply(replyBox(emoji.get("check") + " Autoresponder #" + found.id + " removed."));
    }

    if (sub === "enable" || sub === "on") {
      const found = findRule(guildId, args.slice(1).join(" "));
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      db.setAutoresponderEnabled(guildId, found.id, true);
      return message.reply(replyBox(emoji.get("check") + " Autoresponder #" + found.id + " is now ON."));
    }

    if (sub === "disable" || sub === "off") {
      const found = findRule(guildId, args.slice(1).join(" "));
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      db.setAutoresponderEnabled(guildId, found.id, false);
      return message.reply(replyBox(emoji.get("check") + " Autoresponder #" + found.id + " is now OFF."));
    }

    if (sub === "test") {
      const found = findRule(guildId, args.slice(1).join(" "));
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      const rendered = renderAutomationMessage(found.response, {
        member: message.member,
        guild: message.guild,
        channel: message.channel,
        message: found.trigger_text,
      });
      await message.channel.send({
        content: rendered,
        allowedMentions: { parse: ["users", "roles"] },
      });
      return message.reply(replyBox(emoji.get("check") + " Test sent for autoresponder #" + found.id + "."));
    }

    if (sub === "clear") {
      db.clearAutoresponders(guildId);
      return message.reply(replyBox(emoji.get("check") + " All autoresponders have been removed from this server."));
    }

    if (sub === "placeholders" || sub === "variables") {
      return message.reply(replyBox("**Autoresponder placeholders**\n\n" + automationPlaceholderHelp()));
    }

    const rules = db.getAllAutoresponders(guildId);
    if (!rules.length) {
      return message.reply(replyBox(
        emoji.get("info") + " No autoresponders are configured.\n\n" +
        "Use .autoresponder add hello | Hey {user}!"
      ));
    }

    const lines = rules.map(rule =>
      "**#" + rule.id + "** · " + rule.trigger_text + " · " +
      (rule.enabled ? "🟢 ON" : "🔴 OFF") + " · " + rule.match_type +
      "\n↳ " + rule.response
    );

    return message.reply(replyBox(
      "**Autoresponders (" + rules.length + ")**\n\n" +
      lines.join("\n\n") +
      "\n\nManage: .autoresponder enable <id> • .autoresponder disable <id> • .autoresponder test <id>"
    ));
  }

  async slashExecute({ interaction }) {
    const trigger = interaction.options.getString("trigger");
    const reply = interaction.options.getString("response");
    const match = interaction.options.getString("match") || "contains";
    try {
      db.addAutoresponder(interaction.guild.id, trigger, reply, match);
      return interaction.reply(replyBox(
        emoji.get("check") + " Autoresponder added for " + trigger + " (" + match + ")."
      ));
    } catch (error) {
      if (String(error.message).toLowerCase().includes("unique")) {
        return interaction.reply(replyBox(emoji.get("cross") + " That trigger already exists in this server."));
      }
      throw error;
    }
  }
}

export default new AutoResponderCommand();
