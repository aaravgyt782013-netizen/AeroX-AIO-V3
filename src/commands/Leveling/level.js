import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { memberStats } from "#managers/MemberStatsManager";

const XP_PER_MESSAGE = 10;
const XP_PER_LEVEL_SQUARE = 100;

function getProgress(totalMessages) {
  const xp = Math.max(0, Number(totalMessages) || 0) * XP_PER_MESSAGE;
  const level = Math.floor(Math.sqrt(xp / XP_PER_LEVEL_SQUARE));
  const currentLevelXp = level * level * XP_PER_LEVEL_SQUARE;
  const nextLevelXp = (level + 1) * (level + 1) * XP_PER_LEVEL_SQUARE;
  return {
    xp,
    level,
    current: Math.max(0, xp - currentLevelXp),
    needed: Math.max(1, nextLevelXp - currentLevelXp),
    progress: Math.min(100, Math.floor(((xp - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp)) * 100)),
  };
}

class LevelCommand extends Command {
  constructor() {
    super({
      name: "level",
      description: "View a member's message-based level and progress",
      usage: "level [@member]",
      aliases: ["lvl", "rank"],
      category: "Leveling",
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "level",
        description: "View a member's message-based level and progress",
        options: [
          {
            type: 6,
            name: "member",
            description: "Member to check (defaults to you)",
            required: false,
          },
        ],
      },
    });
  }

  async sendLevel(guild, user, replyTarget) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const stats = memberStats.getMemberStats(guild.id, user.id);
    const totalMessages = Math.max(0, Number(stats?.messages) || 0);
    const { xp, level, current, needed, progress } = getProgress(totalMessages);
    const filled = Math.round(progress / 10);
    const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: `${member?.displayName || user.globalName || user.username} • Level Progress`,
        iconURL: user.displayAvatarURL(),
      })
      .setDescription(
        `🏆 **Level ${level}**\n` +
        `${bar} **${progress}%**\n\n` +
        `**XP:** ${xp.toLocaleString("en-US")}\n` +
        `**Progress:** ${current.toLocaleString("en-US")} / ${needed.toLocaleString("en-US")} XP\n` +
        `**Messages tracked:** ${totalMessages.toLocaleString("en-US")}\n\n` +
        `*Levels are calculated from LightCore's tracked message activity (10 XP per tracked message).*`,
      )
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `${guild.name} • LightCore Leveling` });

    return replyTarget.reply({ embeds: [embed] });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const user = message.mentions.users.first()
      || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null)
      || message.author;

    try {
      return await this.sendLevel(message.guild, user, message);
    } catch (error) {
      message.client.logger?.error("LevelCommand", `Could not generate level card: ${error?.message || error}`);
      return message.reply("I couldn't load level progress right now. Please try again shortly.");
    }
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }

    await interaction.deferReply();
    const user = interaction.options.getUser("member") || interaction.user;

    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const stats = memberStats.getMemberStats(interaction.guild.id, user.id);
      const totalMessages = Math.max(0, Number(stats?.messages) || 0);
      const { xp, level, current, needed, progress } = getProgress(totalMessages);
      const filled = Math.round(progress / 10);
      const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({
          name: `${member?.displayName || user.globalName || user.username} • Level Progress`,
          iconURL: user.displayAvatarURL(),
        })
        .setDescription(
          `🏆 **Level ${level}**\n` +
          `${bar} **${progress}%**\n\n` +
          `**XP:** ${xp.toLocaleString("en-US")}\n` +
          `**Progress:** ${current.toLocaleString("en-US")} / ${needed.toLocaleString("en-US")} XP\n` +
          `**Messages tracked:** ${totalMessages.toLocaleString("en-US")}\n\n` +
          `*Levels are calculated from LightCore's tracked message activity (10 XP per tracked message).*`,
        )
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `${interaction.guild.name} • LightCore Leveling` });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      interaction.client.logger?.error("LevelCommand", `Could not generate level card: ${error?.message || error}`);
      return interaction.editReply("I couldn't load level progress right now. Please try again shortly.");
    }
  }
}

export default new LevelCommand();
