import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { memberStats } from "#managers/MemberStatsManager";

function hasPremium(client, userId, guildId) {
  return Boolean(client.db.isUserPremium(userId) || client.db.isGuildPremium(guildId));
}
function duration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
class MemberStatsCommand extends Command {
  constructor() {
    super({
      name: "memberstats",
      description: "View server activity analytics (Premium)",
      usage: "memberstats [@member]",
      aliases: ["mstats", "serverstats"],
      category: "Premium",
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "memberstats",
        description: "View server activity analytics (Premium)",
        options: [{ type: 6, name: "member", description: "Optional member to inspect", required: false }],
      },
    });
  }
  async execute({ client, message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!hasPremium(client, message.author.id, message.guild.id)) return message.reply("⭐ **Member Stats requires LightCore User Premium or Guild Premium.**");
    const target = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
    if (target) {
      const s = memberStats.getMemberStats(message.guild.id, target.id);
      return message.reply({ embeds: [this.memberEmbed(message.guild, target, s)] });
    }
    return message.reply({ embeds: [this.buildEmbed(message.guild, client)] });
  }
  async slashExecute({ client, interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    if (!hasPremium(client, interaction.user.id, interaction.guild.id)) return interaction.reply({ content: "⭐ **Member Stats requires LightCore User Premium or Guild Premium.**", ephemeral: true });
    const target = interaction.options.getUser("member");
    if (target) return interaction.reply({ embeds: [this.memberEmbed(interaction.guild, target, memberStats.getMemberStats(interaction.guild.id, target.id))] });
    return interaction.reply({ embeds: [this.buildEmbed(interaction.guild, client)] });
  }
  memberEmbed(guild, user, stats) {
    return new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 Activity • ${user.username}`)
      .setDescription(`Member activity tracked in **${guild.name}** since this feature was enabled.`)
      .addFields(
        { name: "💬 Messages", value: `**${stats.messages.toLocaleString()}**`, inline: true },
        { name: "🎙️ Voice time", value: `**${duration(stats.voice_ms)}**`, inline: true },
        { name: "🕒 Last message", value: stats.last_message_at ? `<t:${Math.floor(stats.last_message_at / 1000)}:R>` : "No messages tracked yet", inline: true },
      ).setThumbnail(user.displayAvatarURL()).setTimestamp();
  }
  buildEmbed(guild, client) {
    const stats = memberStats.getStats(guild.id);
    const counters = memberStats.getCounters(guild.id).length;
    const topMessages = memberStats.getTopMembers(guild.id, "messages", 3).map((x, i) => `${i + 1}. <@${x.user_id}> — **${Number(x.messages).toLocaleString()}** messages`).join("\n") || "No message activity tracked yet.";
    const topVoice = memberStats.getTopMembers(guild.id, "voice", 3).map((x, i) => `${i + 1}. <@${x.user_id}> — **${duration(Number(x.voice_ms))}**`).join("\n") || "No voice activity tracked yet.";
    return new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: "LightCore • Member Analytics", iconURL: client.user.displayAvatarURL() })
      .setDescription(`Live overview for **${guild.name}**\n*Activity tracking begins after deployment; older activity cannot be recovered.*`)
      .addFields(
        { name: "👥 Total Members", value: `**${guild.memberCount.toLocaleString()}**`, inline: true },
        { name: "📥 Joins tracked", value: `**${Number(stats.joins).toLocaleString()}**`, inline: true },
        { name: "📤 Leaves tracked", value: `**${Number(stats.leaves).toLocaleString()}**`, inline: true },
        { name: "💬 Messages", value: `**${stats.messages.toLocaleString()}**`, inline: true },
        { name: "🎙️ Voice time", value: `**${duration(stats.voice_ms)}**`, inline: true },
        { name: "📊 Active counters", value: `**${counters}**`, inline: true },
        { name: "🏆 Top message members", value: topMessages, inline: false },
        { name: "🎧 Top voice members", value: topVoice, inline: false },
      ).setFooter({ text: "LightCore statistics • voice time measures time connected to voice channels" }).setTimestamp();
  }
}
export default new MemberStatsCommand();
