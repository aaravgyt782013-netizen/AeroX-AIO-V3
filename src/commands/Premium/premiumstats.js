import { Command } from "#structures/classes/Command";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";

class PremiumStatsCommand extends Command {
  constructor() {
    super({
      name: "premiumstats",
      description: "View an overview of your Premium server's live statistics",
      usage: "premiumstats",
      examples: ["premiumstats"],
      aliases: ["pstats", "serverinsights"],
      category: "Premium",
      cooldown: 10,
      guildPrem: true,
    });
  }

  async execute({ message }) {
    if (!message.guild) {
      return message.reply({ content: `${emoji.get("cross")} This command can only be used inside a server.` });
    }
    if (!db.isGuildPremium(message.guild.id)) {
      return message.reply({ content: `${emoji.get("info")} This command requires **Guild Premium**.` });
    }

    const guild = message.guild;
    const memberCount = guild.memberCount;
    const botCount = guild.members.cache.filter(member => member.user.bot).size;
    const cachedHumanCount = guild.members.cache.filter(member => !member.user.bot).size;
    const channelCount = guild.channels.cache.size;
    const roleCount = Math.max(0, guild.roles.cache.size - 1);
    const boostCount = guild.premiumSubscriptionCount ?? 0;
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji.get("premium")} **Premium Server Insights**\nLive overview for **${guild.name}**`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Members:** ${memberCount.toLocaleString()}\n` +
        `**Bots in cache:** ${botCount.toLocaleString()}\n` +
        `**Humans in cache:** ${cachedHumanCount.toLocaleString()}\n` +
        `**Channels:** ${channelCount.toLocaleString()}\n` +
        `**Roles:** ${roleCount.toLocaleString()}\n` +
        `**Server boosts:** ${boostCount.toLocaleString()}\n` +
        `**Created:** <t:${createdAt}:D> (<t:${createdAt}:R>)\n\n` +
        `-# Cached human/bot counts reflect members currently cached by LightCore; they may not equal the full server totals.`
      ));

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export default new PremiumStatsCommand();
