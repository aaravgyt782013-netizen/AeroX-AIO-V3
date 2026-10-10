import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { memberStats } from "#managers/MemberStatsManager";

const fmt = value => Number(value || 0).toLocaleString("en-US");

class StatsCommand extends Command {
  constructor() {
    super({
      name: "stats",
      description: "View Statbot-style statistics for this server",
      usage: "stats",
      aliases: ["serverstats", "guildstats"],
      category: "Stats",
      cooldown: 5,
      enabledSlash: true,
      slashData: { name: "stats", description: "View server statistics and activity" },
    });
  }

  async buildStats(guild) {
    // Fetch members so bot/human and presence figures are as accurate as the
    // bot's Discord intents and permissions allow.
    await guild.members.fetch().catch(() => null);
    const members = guild.members.cache;
    const humans = members.filter(m => !m.user.bot).size;
    const bots = members.filter(m => m.user.bot).size;
    const online = members.filter(m => m.presence && m.presence.status !== "offline").size;
    const text = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased() && !c.isThread()).size;
    const voice = guild.channels.cache.filter(c => c.isVoiceBased()).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;
    const tracked = memberStats.getStats(guild.id);
    const top = memberStats.getTopMembers(guild.id, "messages", 3);
    const topLines = top.length
      ? top.map((row, i) => {
          const user = guild.client.users.cache.get(row.user_id);
          return `${i + 1}. ${user ? user.username : "Unknown member"} — ${fmt(row.messages)} messages`;
        }).join("\n")
      : "No tracked message activity yet. Activity tracking builds over time.";
    const net = Number(tracked.joins || 0) - Number(tracked.leaves || 0);
    const created = Math.floor(guild.createdTimestamp / 1000);
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 📊 ${guild.name} — Server Statistics\nStatbot-inspired overview • live server counts + activity tracked by LightCore`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 👥 Members\n` +
      `├─ **Total:** ${fmt(guild.memberCount)}\n` +
      `├─ **Humans:** ${fmt(humans)}\n` +
      `├─ **Bots:** ${fmt(bots)}\n` +
      `└─ **Online / visible presence:** ${fmt(online)}\n\n` +
      `## 🗂️ Server Structure\n` +
      `├─ **Text channels:** ${fmt(text)}\n` +
      `├─ **Voice channels:** ${fmt(voice)}\n` +
      `├─ **Categories:** ${fmt(categories)}\n` +
      `├─ **Roles:** ${fmt(guild.roles.cache.size)}\n` +
      `├─ **Boosts:** ${fmt(guild.premiumSubscriptionCount || 0)} (Level ${guild.premiumTier})\n` +
      `└─ **Created:** <t:${created}:D> (<t:${created}:R>)`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 📈 Tracked Activity\n` +
      `├─ **Messages recorded:** ${fmt(tracked.messages)}\n` +
      `├─ **Voice time recorded:** ${fmt(Math.floor((tracked.voice_ms || 0) / 60000))} minutes\n` +
      `├─ **Joins recorded since tracking began:** ${fmt(tracked.joins)}\n` +
      `├─ **Leaves recorded since tracking began:** ${fmt(tracked.leaves)}\n` +
      `└─ **Net tracked change:** ${net >= 0 ? "+" : ""}${fmt(net)}`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Most Active Members (tracked messages)\n${topLines}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "*Note: Discord counts are current snapshots. Message, voice, join, and leave analytics only include activity recorded since LightCore's tracking was active; older history is not reconstructed.*"
    ));
    return container;
  }

  async execute({ message }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    try {
      return await message.reply({ components: [await this.buildStats(message.guild)], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      message.client.logger?.error("StatsCommand", `Could not build server stats: ${error?.message || error}`);
      return message.reply("I couldn't load server statistics. Please try again shortly.");
    }
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    await interaction.deferReply();
    try {
      return await interaction.editReply({ components: [await this.buildStats(interaction.guild)], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      interaction.client.logger?.error("StatsCommand", `Could not build server stats: ${error?.message || error}`);
      return interaction.editReply({ content: "I couldn't load server statistics. Please try again shortly." });
    }
  }
}
export default new StatsCommand();
