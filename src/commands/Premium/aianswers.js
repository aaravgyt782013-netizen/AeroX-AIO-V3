import { Command } from "#structures/classes/Command";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { aiAnswers } from "#managers/AIAnswersManager";

function statusEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "LightCore • LC AI" })
    .setTimestamp();
}

class AIAnswersCommand extends Command {
  constructor() {
    super({
      name: "aianswers",
      description: "Configure Premium LC AI answers in one server channel",
      usage: "aianswers <set #channel|off|status>",
      aliases: ["aianswer", "aichannel", "aihelpchannel"],
      category: "Premium",
      cooldown: 5,
    });
  }

  async execute({ message, args }) {
    if (!message.guild) {
      return message.reply({ embeds: [statusEmbed("Server only", "Use this command inside a Discord server.", 0xED4245)] });
    }
    if (!db.isGuildPremium(message.guild.id)) {
      return message.reply({ embeds: [statusEmbed("Guild Premium required", "⭐ LC AI is available to Guild Premium servers only.", 0xED4245)] });
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && message.guild.ownerId !== message.author.id) {
      return message.reply({ embeds: [statusEmbed("Permission required", "You need **Manage Server** permission to configure LC AI.", 0xED4245)] });
    }

    const action = (args[0] || "status").toLowerCase();
    if (action === "off" || action === "disable") {
      aiAnswers.setChannel(message.guild.id, null);
      return message.reply({ embeds: [statusEmbed("LC AI disabled", "LC AI has been turned off for this server.", 0xED4245)] });
    }

    if (action === "status") {
      const channelId = aiAnswers.getChannel(message.guild.id);
      const configured = Boolean(channelId);
      const keyConfigured = Boolean(process.env.GEMINI_API_KEY);
      const description = [
        `**Channel:** ${configured ? `<#${channelId}>` : "Not configured"}`,
        `**AI key:** ${keyConfigured ? "Present in the bot environment" : "Missing from Render environment"}`,
        "**AI connection/quota:** Checked when a message is answered.",
        "",
        configured && keyConfigured
          ? "Setup looks complete. Send a normal message in the configured channel to test LC AI."
          : "Use the setup steps below to finish configuration.",
      ].join("\n");
      return message.reply({
        embeds: [statusEmbed("LC AI status", description, configured && keyConfigured ? 0x57F287 : 0xFEE75C)],
      });
    }

    if (action !== "set") {
      return message.reply({
        embeds: [statusEmbed("LC AI commands", [
          "`.aianswers set #channel` — enable LC AI in a channel",
          "`.aianswers status` — inspect configuration",
          "`.aianswers off` — disable LC AI",
          "",
          "Use the bot's configured prefix if it is not a dot.",
        ].join("\n"))],
      });
    }

    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ""));
    if (!channel?.isTextBased?.() || !channel.guild || channel.guild.id !== message.guild.id) {
      return message.reply({
        embeds: [statusEmbed("Choose a text channel", "Example: `.aianswers set #ask-lightcore`", 0xED4245)],
      });
    }
    if (!process.env.GEMINI_API_KEY) {
      return message.reply({
        embeds: [statusEmbed("AI key missing", "Add GEMINI_API_KEY to the AeroX-AIO-V3 Render service's environment variables, then redeploy. The channel was not changed.", 0xED4245)],
      });
    }

    aiAnswers.setChannel(message.guild.id, channel.id);
    return message.reply({
      embeds: [statusEmbed("LC AI enabled", `Channel: ${channel}\n\nLC AI will answer normal messages in this channel. Usage limits from the AI provider still apply.`, 0x57F287)],
    });
  }
}

export default new AIAnswersCommand();
