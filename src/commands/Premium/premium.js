import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import emoji from "#config/emoji";

class PremiumCommand extends Command {
  constructor() {
    super({
      name: "premium",
      description: "View Premium features, access, and commands",
      usage: "premium",
      aliases: ["premiuminfo", "preminfo"],
      category: "Premium",
      examples: ["premium"],
      cooldown: 5,
    });
  }

  async execute({ client, message }) {
    const userPremium = client.db.isUserPremium(message.author.id);
    const guildPremium = message.guild ? client.db.isGuildPremium(message.guild.id) : false;

    const userStatus = userPremium
      ? (userPremium.isPermanent ? "Active • Lifetime" : `Active • Expires <t:${Math.floor(userPremium.expiresAt / 1000)}:R>`)
      : "Not active";

    const guildStatus = guildPremium
      ? (guildPremium.isPermanent ? "Active • Lifetime" : `Active • Expires <t:${Math.floor(guildPremium.expiresAt / 1000)}:R>`)
      : "Not active";

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("premium")} **LightCore Premium**`
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Your Premium:** ${userStatus}\n` +
        `**This Server:** ${guildStatus}\n\n` +
        `### Premium User`
      ),
      new TextDisplayBuilder().setContent(
        `${emoji.get("premium")} **No-prefix commands** — use commands like \`ban @user\` without the configured prefix.\n` +
        `${emoji.get("premium")} **Custom prefix** — set a personal command prefix.\n` +
        `${emoji.get("premium")} **Premium status** — view your Premium access and expiry.\n` +
        `${emoji.get("premium")} **Premium-only features** — access commands/features marked for Premium users.`
      ),
      new TextDisplayBuilder().setContent(
        `### Premium Server`
      ),
      new TextDisplayBuilder().setContent(
        `${emoji.get("premium")} **Custom server profile** — Premium servers can customize the bot identity used by LightCore responses.\n` +
        `${emoji.get("premium")} **Name / avatar / banner / color** — configure the server's Premium profile.\n` +
        `${emoji.get("premium")} **Server nickname** — LightCore can use the Premium profile name as its server nickname.`
      ),
      new TextDisplayBuilder().setContent(
        `### Premium Commands`
      ),
      new TextDisplayBuilder().setContent(
        `\`premium\` • Premium overview\n` +
        `\`premiumuser status\` • Premium user status\n` +
        `\`premiumuser prefix <prefix>\` • Set your Premium prefix\n` +
        `\`premiumuser resetprefix\` • Reset your Premium prefix\n` +
        `\`premiumprofile view\` • View the server Premium profile\n` +
        `\`premiumprofile name <name>\` • Set server name\n` +
        `\`premiumprofile avatar <url>\` • Set server avatar\n` +
        `\`premiumprofile banner <url>\` • Set server banner\n` +
        `\`premiumprofile color <#RRGGBB>\` • Set profile color\n` +
        `\`premiumprofile reset\` • Reset server profile`
      ),
      new TextDisplayBuilder().setContent(
        "**Member Stats & Live Counters**\\n" +
        "memberstats • View member analytics\\n" +
        "membercounter setup <metric> [label] • Create a live counter\\n" +
        "membercounter list • List counters\\n" +
        "membercounter remove <channel-id> • Remove a counter"
      ),
      new TextDisplayBuilder().setContent(
        `-# Premium access is granted and managed by the bot owner. Guild Premium can now set LightCore's server nickname, server avatar and server banner through Discord's current-member profile API.`
      )
    );

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

export default new PremiumCommand();
