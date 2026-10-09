import { Command } from "#structures/classes/Command";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { memberStats } from "#managers/MemberStatsManager";

const METRICS = {
  members: "👥 Members",
  humans: "👤 Humans",
  bots: "🤖 Bots",
  channels: "🗂️ Channels",
  roles: "🎭 Roles",
  boosts: "🚀 Boosts",
};

function hasPremium(client, userId, guildId) {
  return Boolean(client.db.isUserPremium(userId) || client.db.isGuildPremium(guildId));
}

class MemberStatsCommand extends Command {
  constructor() {
    super({
      name: "memberstats",
      description: "View member and server statistics (Premium)",
      usage: "memberstats",
      aliases: ["mstats", "serverstats"],
      category: "Premium",
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "memberstats",
        description: "View member and server statistics (Premium)",
      },
    });
  }

  async execute({ client, message }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!hasPremium(client, message.author.id, message.guild.id)) {
      return message.reply("⭐ **Member Stats requires LightCore User Premium or Guild Premium.**");
    }
    return message.reply({ embeds: [this.buildEmbed(message.guild, client)] });
  }

  async slashExecute({ client, interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    if (!hasPremium(client, interaction.user.id, interaction.guild.id)) {
      return interaction.reply({ content: "⭐ **Member Stats requires LightCore User Premium or Guild Premium.**", ephemeral: true });
    }
    return interaction.reply({ embeds: [this.buildEmbed(interaction.guild, client)] });
  }

  buildEmbed(guild, client) {
    const stats = memberStats.getStats(guild.id);
    const cached = guild.members.cache;
    const humans = cached.filter(member => !member.user.bot).size;
    const bots = cached.filter(member => member.user.bot).size;
    const counters = memberStats.getCounters(guild.id).length;
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: "LightCore • Member Analytics", iconURL: client.user.displayAvatarURL() })
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setDescription(`Live overview for **${guild.name}**`)
      .addFields(
        { name: "👥 Total Members", value: `**${guild.memberCount.toLocaleString()}**`, inline: true },
        { name: "👤 Humans (cached)", value: `**${humans.toLocaleString()}**`, inline: true },
        { name: "🤖 Bots (cached)", value: `**${bots.toLocaleString()}**`, inline: true },
        { name: "📥 Joins tracked", value: `**${Number(stats.joins).toLocaleString()}**`, inline: true },
        { name: "📤 Leaves tracked", value: `**${Number(stats.leaves).toLocaleString()}**`, inline: true },
        { name: "📊 Active counters", value: `**${counters}**`, inline: true },
      )
      .setFooter({ text: "Join/leave history starts when this feature is deployed; member counts are live." })
      .setTimestamp();
  }
}

export default new MemberStatsCommand();
