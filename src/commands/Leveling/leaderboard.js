import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { leveling } from "#managers/LevelingManager";

class LeaderboardCommand extends Command {
  constructor() {
    super({
      name: "leaderboard",
      description: "Show the server's top members by XP",
      usage: "leaderboard [page]",
      aliases: ["lb", "levels", "toplevels"],
      category: "Leveling",
      cooldown: 8,
      enabledSlash: true,
      slashData: {
        name: "leaderboard",
        description: "Show the server's top members by XP",
        options: [{ type: 4, name: "page", description: "Leaderboard page", required: false, min_value: 1, max_value: 20 }],
      },
    });
  }

  async buildEmbed(guild, page = 1) {
    const offset = (Math.max(1, page) - 1) * 10;
    const rows = leveling.getLeaderboard(guild.id, 10, offset);
    const lines = await Promise.all(rows.map(async (row) => {
      const user = await guild.client.users.fetch(row.user_id).catch(() => null);
      const name = user ? (user.globalName || user.username) : `Member ${row.user_id.slice(-4)}`;
      const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `**#${row.rank}**`;
      return `${medal} **${name}** — Level ${row.level} · ${row.xp.toLocaleString("en-US")} XP`;
    }));
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🏆 LightCore Level Leaderboard")
      .setDescription(lines.length ? lines.join("\n") : "No XP has been earned yet. Send messages to get started!")
      .setFooter({ text: `${guild.name} • Page ${Math.max(1, page)}` })
      .setTimestamp();
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const page = Math.max(1, Math.min(20, Number.parseInt(args[0], 10) || 1));
    return message.reply({ embeds: [await this.buildEmbed(message.guild, page)] });
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    await interaction.deferReply();
    const page = interaction.options.getInteger("page") || 1;
    return interaction.editReply({ embeds: [await this.buildEmbed(interaction.guild, page)] });
  }
}

export default new LeaderboardCommand();
