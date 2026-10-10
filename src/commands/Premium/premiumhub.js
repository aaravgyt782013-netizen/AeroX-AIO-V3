import { Command } from "#structures/classes/Command";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { premiumFeatures } from "#managers/PremiumFeaturesManager";

class PremiumHubCommand extends Command {
  constructor() {
    super({
      name: "premiumhub",
      description: "Open the Guild Premium control center",
      usage: "premiumhub [levels on|off|channel #channel]",
      aliases: ["guildpremiumhub"],
      category: "Premium",
      cooldown: 5
    });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("Use this command inside a server.");
    if (!db.isGuildPremium(message.guild.id)) return message.reply("⭐ This control center requires **Guild Premium**.");
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && message.guild.ownerId !== message.author.id) {
      return message.reply("You need **Manage Server** permission to manage Guild Premium settings.");
    }

    const action = (args[0] || "").toLowerCase();
    if (action === "levels") {
      const mode = (args[1] || "").toLowerCase();
      if (!["on", "off"].includes(mode)) return message.reply("Usage: `.premiumhub levels on` or `.premiumhub levels off`");
      premiumFeatures.setLevelSettings(message.guild.id, { enabled: mode === "on" });
      return message.reply(`✅ Premium leveling is now **${mode === "on" ? "enabled" : "disabled"}**.`);
    }
    if (action === "channel") {
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ""));
      if (!channel?.isTextBased?.() || channel.guild.id !== message.guild.id) {
        return message.reply("Usage: `.premiumhub channel #level-ups`");
      }
      premiumFeatures.setLevelSettings(message.guild.id, { announce_channel_id: channel.id });
      return message.reply(`✅ Level-up announcements will go to ${channel}.`);
    }

    const settings = premiumFeatures.getLevelSettings(message.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("💎 LightCore • Guild Premium Control Center")
      .setDescription("Manage your server's premium engagement features without changing other bot settings.")
      .addFields(
        { name: "Advanced Leveling", value: `Status: **${settings.enabled ? "Enabled" : "Disabled"}**\nAnnouncement channel: ${settings.announce_channel_id ? `<#${settings.announce_channel_id}>` : "Current chat channel"}\n`.concat("Commands: `.premiumhub levels on|off`, `.premiumhub channel #channel`, `.level`, `.leaderboard`") },
        { name: "Premium User Profiles", value: "Members with User Premium can customize their personal card with `.profile set title|bio|color` and view it with `.profile`." },
        { name: "Quick setup", value: "1. Turn leveling on.\n2. Choose a level-up channel.\n3. Members can view their progress with `.level` and rankings with `.leaderboard`." }
      )
      .setFooter({ text: "Only Guild Premium features are configured here." })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
}

export default new PremiumHubCommand();
