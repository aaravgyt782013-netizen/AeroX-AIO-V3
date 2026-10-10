import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { aiAnswers } from "#managers/AIAnswersManager";

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
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!db.isGuildPremium(message.guild.id)) {
      return message.reply("⭐ **AI Answers requires Guild Premium.** This feature is available to Premium servers only.");
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && message.guild.ownerId !== message.author.id) {
      return message.reply("You need **Manage Server** permission to configure AI Answers.");
    }

    const action = (args[0] || "status").toLowerCase();
    if (action === "off" || action === "disable") {
      aiAnswers.setChannel(message.guild.id, null);
      return message.reply("✅ Premium AI Answers is disabled for this server.");
    }
    if (action === "status") {
      const channelId = aiAnswers.getChannel(message.guild.id);
      return message.reply(channelId
        ? `🤖 AI Answers is enabled in <#${channelId}>.`
        : "🤖 AI Answers is not configured. Use `aianswers set #channel`.");
    }
    if (action !== "set") {
      return message.reply("Use `aianswers set #channel`, `aianswers status`, or `aianswers off`.");
    }
    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ""));
    if (!channel?.isTextBased?.() || !channel.guild || channel.guild.id !== message.guild.id) {
      return message.reply("Please mention a text channel in this server, for example `aianswers set #ask-lightcore`.");
    }
    if (!process.env.OPENAI_API_KEY) {
      return message.reply("⚠️ AI Answers needs the `OPENAI_API_KEY` environment variable on the bot service before it can answer questions. The channel was not changed.");
    }
    aiAnswers.setChannel(message.guild.id, channel.id);
    return message.reply(`✅ Premium AI Answers enabled in ${channel}. Questions asked there will receive AI-generated replies.`);
  }
}

export default new AIAnswersCommand();
