import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import { premiumFeatures } from "#managers/PremiumFeaturesManager";

class LevelCommand extends Command {
  constructor() {
    super({ name: "level", description: "View your premium server XP and level", usage: "level [@user]", aliases: ["ranklevel"], category: "Premium", cooldown: 4 });
  }

  async execute({ message }) {
    if (!message.guild) return message.reply("Use this command inside a server.");
    if (!db.isGuildPremium(message.guild.id)) return message.reply("⭐ This leveling feature requires **Guild Premium**.");
    const member = message.mentions.members.first() || message.member;
    const stats = premiumFeatures.getLevel(message.guild.id, member.id);
    const leaderboard = premiumFeatures.getLeaderboard(message.guild.id, 1000);
    const rank = leaderboard.findIndex(row => row.user_id === member.id) + 1;
    const currentFloor = stats.level * stats.level * 100;
    const nextFloor = (stats.level + 1) * (stats.level + 1) * 100;
    const progress = Math.max(0, stats.xp - currentFloor);
    const needed = Math.max(1, nextFloor - currentFloor);
    const filled = Math.min(10, Math.floor((progress / needed) * 10));
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: `${member.user.username}'s LightCore Rank`, iconURL: member.displayAvatarURL() })
      .setDescription(`**Level ${stats.level}**  •  **Rank #${rank || "—"}**\n${"▰".repeat(filled)}${"▱".repeat(10-filled)}\n${progress} / ${needed} XP to next level`)
      .addFields({ name: "Total XP", value: stats.xp.toLocaleString(), inline: true })
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .setFooter({ text: "Guild Premium • XP is earned through chat activity" });
    return message.reply({ embeds: [embed] });
  }
}

export default new LevelCommand();
