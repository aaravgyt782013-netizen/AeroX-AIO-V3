import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import emoji from "#config/emoji";

function box(title, description) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function getChannel(message, raw) {
  const mentioned = message.mentions.channels.first();
  if (mentioned) return mentioned;
  const id = String(raw || "").replace(/[<#>]/g, "");
  return message.guild.channels.cache.get(id) || null;
}

class AutoReactCommand extends Command {
  constructor() {
    super({
      name: "autoreact",
      description: "Configure automatic reactions for selected channels",
      usage: "autoreact <add|remove|list|clear> [#channel] [emoji]",
      aliases: ["ar", "react"],
      category: "Extra",
      examples: [
        "autoreact add #memes 👍",
        "autoreact remove #memes 👍",
        "autoreact remove #memes",
        "autoreact list",
        "autoreact clear",
      ],
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.SendMessages],
    });
  }

  async execute({ client, message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const guildId = message.guild.id;
    const premiumOnly = config.features?.autoReactPremiumOnly !== false;
    if (premiumOnly && !db.isGuildPremium(guildId)) {
      return message.reply(box(
        `${emoji.get("cross")} **Guild Premium Required**`,
        "AutoReact is currently a Guild Premium feature. The bot owner can make it available to every server by setting `AUTOREACT_PREMIUM_ONLY=false` in the bot's environment variables and restarting/redeploying it."
      ));
    }

    const action = String(args[0] || "list").toLowerCase();
    const settings = db.getAutoReactions(guildId);

    if (action === "list") {
      const entries = Object.entries(settings);
      const description = entries.length
        ? entries.map(([channelId, emojis]) => {
            const channel = message.guild.channels.cache.get(channelId);
            return `• ${channel ? channel.toString() : `<#${channelId}>`}: ${emojis.join(" ")}`;
          }).join("\n")
        : "No auto reactions are configured. Use `autoreact add #channel 👍`.";
      return message.reply(box(`${emoji.get("autoreact")} **AutoReact Settings**`, description));
    }

    if (action === "clear") {
      db.setAutoReactions(guildId, {});
      return message.reply(box(`${emoji.get("check")} **AutoReact Cleared**`, "All automatic reactions have been removed for this server."));
    }

    if (action === "add") {
      const channel = getChannel(message, args[1]);
      const reaction = args[2];
      if (!channel || !channel.isTextBased() || !channel.messages) {
        return message.reply("Please mention a valid text channel. Example: `autoreact add #memes 👍`");
      }
      if (!reaction) return message.reply("Please provide an emoji to react with.");
      const emojis = Array.isArray(settings[channel.id]) ? settings[channel.id] : [];
      if (emojis.includes(reaction)) return message.reply("That emoji is already configured for this channel.");
      if (emojis.length >= 5) return message.reply("A maximum of 5 auto-reaction emojis per channel is allowed.");
      emojis.push(reaction);
      settings[channel.id] = emojis;
      db.setAutoReactions(guildId, settings);
      return message.reply(box(`${emoji.get("check")} **AutoReact Added**`, `I'll try to react to new messages in ${channel} with ${emojis.join(" ")}. Make sure I have View Channel, Read Message History, and Add Reactions permissions.`));
    }

    if (action === "remove") {
      const channel = getChannel(message, args[1]);
      if (!channel) return message.reply("Please mention a valid channel. Example: `autoreact remove #memes`");
      if (!settings[channel.id]) return message.reply("No auto reactions are configured for that channel.");
      const reaction = args[2];
      if (reaction) {
        settings[channel.id] = settings[channel.id].filter(value => value !== reaction);
        if (!settings[channel.id].length) delete settings[channel.id];
      } else {
        delete settings[channel.id];
      }
      db.setAutoReactions(guildId, settings);
      return message.reply(box(`${emoji.get("check")} **AutoReact Updated**`, reaction ? `Removed ${reaction} from ${channel}.` : `Removed all automatic reactions from ${channel}.`));
    }

    return message.reply(`Unknown action. Use \`${config.prefix}autoreact add #channel 👍\`, \`${config.prefix}autoreact remove #channel [emoji]\`, \`${config.prefix}autoreact list\`, or \`${config.prefix}autoreact clear\`.`);
  }
}

export default new AutoReactCommand();
