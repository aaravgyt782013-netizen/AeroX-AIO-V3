import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import { premiumFeatures } from "#managers/PremiumFeaturesManager";

class LeaderboardCommand extends Command {
  constructor() {
    super({ name: "leaderboard", description: "Show the Guild Premium XP leaderboard", usage: "leaderboard", aliases: ["levelsboard", "xpleaderboard"], category: "Premium", cooldown: 8 });
  }
  async execute({ message }) {
    if (!message.guild) return message.reply("Use this command inside a server.");
    if (!db.isGuildPremium(message.guild.id)) return message.reply("⭐ This leaderboard requires **Guild Premium**.");
    const rows = premiumFeatures.getLeaderboard(message.guild.id, 10);
    if (!rows.length) return message.reply("No XP recorded yet. Send messages to start earning XP.");
    const lines = rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — Level **${row.level}** · ${row.xp.toLocaleString()} XP`);
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle("🏆 LightCore Premium Leaderboard").setDescription(lines.join("\n")).setFooter({ text: "Guild Premium • Top 10 by total XP" }).setTimestamp();
    return message.reply({ embeds: [embed] });
  }
}
export default new LeaderboardCommand();
