import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { leveling } from "#managers/LevelingManager";

class LevelCommand extends Command {
  constructor() {
    super({
      name: "level",
      description: "View your or another member's rank, XP, and progress",
      usage: "level [@member]",
      aliases: ["lvl", "rank"],
      category: "Leveling",
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "level",
        description: "View your or another member's rank, XP, and progress",
        options: [{ type: 6, name: "member", description: "Member to check (defaults to you)", required: false }],
      },
    });
  }

  async buildEmbed(guild, user) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const stats = leveling.getRank(guild.id, user.id);
    const filled = Math.round(stats.progress / 10);
    const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `${member?.displayName || user.globalName || user.username} • Rank Card`, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription(
        `## 🏆 Level ${stats.level}  ·  Rank #${stats.rank}\n` +
        `\`${bar}\` **${stats.progress}%**\n\n` +
        `**Total XP**  ${stats.xp.toLocaleString("en-US")} XP\n` +
        `**Level progress**  ${stats.current.toLocaleString("en-US")} / ${stats.needed.toLocaleString("en-US")} XP\n` +
        `**Next level at**  ${(stats.xp + (stats.needed - stats.current)).toLocaleString("en-US")} XP`
      )
      .setFooter({ text: `${guild.name} • LightCore Leveling` })
      .setTimestamp();
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const user = message.mentions.users.first()
      || (args[0] ? await message.client.users.fetch(args[0].replace(/[<@!>]/g, "")).catch(() => null) : null)
      || message.author;
    try {
      return message.reply({ embeds: [await this.buildEmbed(message.guild, user)] });
    } catch (error) {
      message.client.logger?.error("LevelCommand", error);
      return message.reply("I couldn't load the rank card right now. Please try again.");
    }
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    await interaction.deferReply();
    const user = interaction.options.getUser("member") || interaction.user;
    try {
      return interaction.editReply({ embeds: [await this.buildEmbed(interaction.guild, user)] });
    } catch (error) {
      interaction.client.logger?.error("LevelCommand", error);
      return interaction.editReply("I couldn't load the rank card right now. Please try again.");
    }
  }
}

export default new LevelCommand();
