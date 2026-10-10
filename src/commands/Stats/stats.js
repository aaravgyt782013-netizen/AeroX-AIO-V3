import { Command } from "#structures/classes/Command";
import { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from "discord.js";
import { memberStats } from "#managers/MemberStatsManager";

const fmt = value => Number(value || 0).toLocaleString("en-US");
class StatsCommand extends Command {
  constructor() {
    super({
      name: "stats",
      description: "View Statbot-style server and member activity analytics",
      usage: "stats [@member]",
      aliases: ["guildstats"],
      category: "Stats",
      cooldown: 5,
      enabledSlash: true,
      slashData: { name: "stats", description: "View member activity and server statistics", options: [{ type: 6, name: "member", description: "Optional member to inspect", required: false }] },
    });
  }

  async buildStats(guild, targetUser = null) {
    if (targetUser) {
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      const s = memberStats.getMemberStats(guild.id, targetUser.id);
      const container = new ContainerBuilder();
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📊 Member Statistics — ${targetUser.username}\nActivity tracked in **${guild.name}** by LightCore`
      ));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## 💬 Message Activity\n├─ **Today:** ${fmt(s.today)}\n├─ **Last 7 days:** ${fmt(s.seven_day)}\n├─ **Last 30 days:** ${fmt(s.thirty_day)}\n└─ **All-time tracked:** ${fmt(s.messages)}\n\n` +
        `## 🎙️ Voice Activity\n└─ **Tracked voice time:** ${fmt(Math.floor((s.voice_ms || 0) / 60000))} minutes\n\n` +
        `## 🕒 Last Message\n${s.last_message_at ? `<t:${Math.floor(s.last_message_at / 1000)}:R>` : "No messages tracked yet"}\n\n` +
        `## 👤 Member Details\n├─ **Joined server:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "Not available"}\n└─ **Account created:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`
      ));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent("*Activity tracking starts when LightCore is online with tracking enabled. Earlier message and voice history cannot be reconstructed.*"));
      return container;
    }

    await guild.members.fetch().catch(() => null);
    const members = guild.members.cache;
    const humans = members.filter(m => !m.user.bot).size;
    const bots = members.filter(m => m.user.bot).size;
    const online = members.filter(m => m.presence && m.presence.status !== "offline").size;
    const text = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased() && !c.isThread()).size;
    const voice = guild.channels.cache.filter(c => c.isVoiceBased()).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;
    const tracked = memberStats.getStats(guild.id);
    const top = memberStats.getTopMembers(guild.id, "messages", 5);
    const topLines = top.length ? top.map((row, i) => `${i + 1}. <@${row.user_id}> — **${fmt(row.messages)}** messages`).join("\n") : "No tracked message activity yet. The leaderboard will build as members chat.";
    const topVoice = memberStats.getTopMembers(guild.id, "voice", 5);
    const voiceLines = topVoice.length ? topVoice.map((row, i) => `${i + 1}. <@${row.user_id}> — **${fmt(Math.floor((row.voice_ms || 0) / 60000))} min**`).join("\n") : "No voice activity tracked yet.";
    const net = Number(tracked.joins || 0) - Number(tracked.leaves || 0);
    const created = Math.floor(guild.createdTimestamp / 1000);
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📊 ${guild.name} — Member Statistics\nStatbot-inspired analytics • live server counts and tracked member activity`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 👥 Members\n├─ **Total:** ${fmt(guild.memberCount)}\n├─ **Humans:** ${fmt(humans)}\n├─ **Bots:** ${fmt(bots)}\n└─ **Online / visible presence:** ${fmt(online)}\n\n` +
      `## 🗂️ Server Structure\n├─ **Text channels:** ${fmt(text)}\n├─ **Voice channels:** ${fmt(voice)}\n├─ **Categories:** ${fmt(categories)}\n├─ **Roles:** ${fmt(guild.roles.cache.size)}\n├─ **Boosts:** ${fmt(guild.premiumSubscriptionCount || 0)} (Level ${guild.premiumTier})\n└─ **Created:** <t:${created}:D> (<t:${created}:R>)`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 📈 Tracked Activity\n├─ **Messages recorded:** ${fmt(tracked.messages)}\n├─ **Voice time recorded:** ${fmt(Math.floor((tracked.voice_ms || 0) / 60000))} minutes\n├─ **Joins recorded:** ${fmt(tracked.joins)}\n├─ **Leaves recorded:** ${fmt(tracked.leaves)}\n└─ **Net tracked change:** ${net >= 0 ? "+" : ""}${fmt(net)}`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Most Active Members • Messages\n${topLines}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎧 Most Active Members • Voice\n${voiceLines}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("*Discord counts are current snapshots. Message, voice, join, and leave analytics only include activity recorded while LightCore tracking is active; earlier history cannot be reconstructed.*"));
    return container;
  }

  async execute({ message, args, client }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    try {
      const id = args[0]?.replace(/[<@!>]/g, "");
      const target = message.mentions.users.first() || (id ? await client.users.fetch(id).catch(() => null) : null);
      return await message.reply({ components: [await this.buildStats(message.guild, target)], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      message.client.logger?.error("StatsCommand", `Could not build member stats: ${error?.message || error}`);
      return message.reply("I couldn't load member statistics. Please try again shortly.");
    }
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    await interaction.deferReply();
    try {
      return await interaction.editReply({ components: [await this.buildStats(interaction.guild, interaction.options.getUser("member"))], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      interaction.client.logger?.error("StatsCommand", `Could not build member stats: ${error?.message || error}`);
      return interaction.editReply({ content: "I couldn't load member statistics. Please try again shortly." });
    }
  }
}
export default new StatsCommand();
