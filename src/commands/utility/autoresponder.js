import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { automationPlaceholderHelp } from "#utils/AutomationUtils";

function replyBox(content) {
  const embed = new EmbedBuilder()
    .setTitle("🤖 Autoresponder")
    .setDescription(content)
    .setColor(0x5865F2)
    .setTimestamp();
  return { embeds: [embed] };
}

function parseRule(raw, allowMode = false) {
  let input = raw.trim();
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

class AutoResponderCommand extends Command {
  constructor() {
    super({
      name: "autoresponder",
      description: "Create automatic replies to messages",
      usage: "autoresponder <add|edit|remove|list|clear|placeholders>",
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
      if (!rule) return message.reply(replyBox(emoji.get("cross") + " Use: .autoresponder add [exact] trigger | response\nExample: .autoresponder add hello | Hey {user}!"));
      try {
        db.addAutoresponder(guildId, rule.trigger, rule.response, rule.matchType);
        return message.reply(replyBox(emoji.get("check") + " Autoresponder added.\n**Trigger:** " + rule.trigger + "\n**Match:** " + rule.matchType + "\n**Response:** " + rule.response));
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
      const id = Number(rule.trigger);
      const found = Number.isInteger(id) ? db.getAutoresponder(guildId, id) : db.findAutoresponder(guildId, rule.trigger);
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      db.updateAutoresponder(guildId, found.id, rule.response);
      return message.reply(replyBox(emoji.get("check") + " Autoresponder #" + found.id + " updated."));
    }

    if (sub === "remove" || sub === "delete") {
      const raw = args.slice(1).join(" ").trim();
      const id = Number(raw);
      const found = Number.isInteger(id) && id > 0 ? db.getAutoresponder(guildId, id) : db.findAutoresponder(guildId, raw);
      if (!found) return message.reply(replyBox(emoji.get("cross") + " Autoresponder not found."));
      db.deleteAutoresponder(guildId, found.id);
      return message.reply(replyBox(emoji.get("check") + " Autoresponder #" + found.id + " removed."));
    }

    if (sub === "clear") {
      db.clearAutoresponders(guildId);
      return message.reply(replyBox(emoji.get("check") + " All autoresponders have been removed from this server."));
    }

    if (sub === "placeholders" || sub === "variables") {
      return message.reply(replyBox("**Autoresponder placeholders**\n\n" + automationPlaceholderHelp()));
    }

    const rules = db.getAutoresponders(guildId);
    if (!rules.length) return message.reply(replyBox(emoji.get("info") + " No autoresponders are configured.\n\nUse .autoresponder add hello | Hey {user}!"));
    const lines = rules.map(rule =>
      "**#" + rule.id + "** · " + rule.trigger_text + " · " + rule.match_type + "\n↳ " + rule.response
    );
    return message.reply(replyBox("**Autoresponders (" + rules.length + ")**\n\n" + lines.join("\n\n") + "\n\nUse .autoresponder remove <id> to delete one."));
  }

  async slashExecute({ interaction }) {
    const trigger = interaction.options.getString("trigger");
    const reply = interaction.options.getString("response");
    const match = interaction.options.getString("match") || "contains";
    try {
      db.addAutoresponder(interaction.guild.id, trigger, reply, match);
      return interaction.reply(replyBox(emoji.get("check") + " Autoresponder added for " + trigger + " (" + match + ")."));
    } catch (error) {
      if (String(error.message).toLowerCase().includes("unique")) {
        return interaction.reply(replyBox(emoji.get("cross") + " That trigger already exists in this server."));
      }
      throw error;
    }
  }
}

export default new AutoResponderCommand();
