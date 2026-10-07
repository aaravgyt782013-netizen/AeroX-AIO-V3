import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";

class PremiumUserCommand extends Command {
  constructor() {
    super({
      name: "premiumuser",
      description: "Manage your Premium user perks",
      usage: "premiumuser <status|prefix|resetprefix> [prefix]",
      aliases: ["mypremium", "premiumme"],
      category: "Premium",
      cooldown: 3,
      userPrem: true,
    });
  }

  async execute({ message, args }) {
    const premium = db.isUserPremium(message.author.id);

    if (!premium) {
      return message.reply({
        content: `${emoji.get("info")} This feature requires **User Premium**.`,
      });
    }

    const action = (args[0] || "status").toLowerCase();

    if (action === "status") {
      const prefixes = db.getUserPrefixes(message.author.id) || [];
      const prefixText = prefixes.length
        ? prefixes.map((prefix) => `\`${prefix}\``).join(", ")
        : "None";
      const expiryText = premium.isPermanent || !premium.expiresAt
        ? "Never"
        : `<t:${Math.floor(premium.expiresAt / 1000)}:R>`;

      return message.reply({
        content:
          `${emoji.get("premium")} **Your Premium**\n` +
          `**Status:** Active\n` +
          `**Expires:** ${expiryText}\n` +
          `**Custom prefix:** ${prefixText}\n\n` +
          `**Perks:** No-prefix commands • Custom prefix • Premium commands`,
      });
    }

    if (action === "prefix") {
      const prefix = args.slice(1).join(" ").trim();

      if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
        return message.reply({
          content: `${emoji.get("cross")} Prefix must be 1–5 characters with no spaces.`,
        });
      }

      if ([ "@", "#", "/", "\\", "<", ">" ].some((character) => prefix.includes(character))) {
        return message.reply({
          content: `${emoji.get("cross")} That prefix contains a reserved character.`,
        });
      }

      db.setUserPrefixes(message.author.id, [prefix]);

      return message.reply({
        content: `${emoji.get("check")} Your Premium custom prefix is now \`${prefix}\`.`,
      });
    }

    if (action === "resetprefix") {
      db.setUserPrefixes(message.author.id, []);

      return message.reply({
        content: `${emoji.get("check")} Your Premium custom prefix has been reset.`,
      });
    }

    return message.reply({
      content: `${emoji.get("cross")} Use: \`${this.usage}\``,
    });
  }
}

export default new PremiumUserCommand();
