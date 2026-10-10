import { Command } from "#structures/classes/Command";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { aiAnswers } from "#managers/AIAnswersManager";

function statusEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "LightCore • Premium AI Answers" })
    .setTimestamp();
}

class AIAnswersCommand extends Command {
  constructor() {
    super({
      name: "aianswers",
      description: "Configure Premium AI answers in one server channel",
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
      return message.reply({ embeds: [statusEmbed("Guild Premium required", "⭐ AI Answers is available to Guild Premium servers only.", 0xED4245)] });
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && message.guild.ownerId !== message.author.id) {
      return message.reply({ embeds: [statusEmbed("Permission required", "You need **Manage Server** permission to configure AI Answers.", 0xED4245)] });
    }

    const action = (args[0] || "status").toLowerCase();
    if (action === "off" || action === "disable") {
      aiAnswers.setChannel(message.guild.id, null);
      return message.reply({ embeds: [statusEmbed("AI Answers disabled", "AI Answers has been turned off for this server.", 0xED4245)] });
    }

    if (action === "status") {
      const channelId = aiAnswers.getChannel(message.guild.id);
      const configured = Boolean(channelId);
      const keyConfigured = Boolean(process.env.OPENAI_API_KEY);
      const description = [
        `**Channel:** ${configured ? `<#${channelId}>` : "Not configured"}`,
        `**API key:** ${keyConfigured ? "Present in the bot environment" : "Missing from Render environment"}`,
        "**API billing/credits:** Not verified by this status command; the provider checks this when a message is answered.",
        "",
        configured && keyConfigured
          ? "Setup looks complete. If replies fail with a billing/credits error, the bot owner must check the OpenAI API account usage and billing."
          : "Use the setup steps below to finish configuration.",
      ].join("\n");
      return message.reply({
        embeds: [statusEmbed("AI Answers status", description, configured && keyConfigured ? 0x57F287 : 0xFEE75C)],
      });
    }

    if (action !== "set") {
      return message.reply({
        embeds: [statusEmbed("AI Answers commands", [
          "`.aianswers set #channel` — enable AI in a channel",
          "`.aianswers status` — inspect configuration",
          "`.aianswers off` — disable AI Answers",
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
    if (!process.env.OPENAI_API_KEY) {
      return message.reply({
        embeds: [statusEmbed("API key missing", "Add OPENAI_API_KEY to the AeroX-AIO-V3 service's Render environment variables, then redeploy. The channel was not changed.", 0xED4245)],
      });
    }

    aiAnswers.setChannel(message.guild.id, channel.id);
    return message.reply({
      embeds: [statusEmbed("AI Answers enabled", `Channel: ${channel}\n\nLightCore will answer normal messages in this channel using AI. The provider account must have available API credits/usage quota.`, 0x57F287)],
    });
  }
}

export default new AIAnswersCommand();
