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
    });
  }

  async execute({ message, args }) {
    const premium = db.isUserPremium(message.author.id);
    if (!premium) return message.reply({ content: `${emoji.get("info")} This feature requires **User Premium**.` });

    const action = args[0]?.toLowerCase() || "status";
    if (action === "status") {
      const prefixes = db.getUserPrefixes(message.author.id);
      return message.reply({
        content: `${emoji.get("premium")} **Your Premium**\n` +
          `**Status:** Active\n` +
          `**Expires:** ${premium.expiresAt ? `<t:${Math.floor(premium.expiresAt / 1000)}:R>` : "Never"}\n` +
          `**Custom prefixes:** ${prefixes.length ? prefixes.map(p => `\\`${p}\\``).join(", ") : "None"}\n\n` +
          `**Perks:** Custom prefixes • faster cooldowns • Premium commands • Premium-only features`
      });
    }

    if (action === "prefix") {
      const prefix = args[1];
      if (!prefix || prefix.length > 5 || /\s/.test(prefix)) return message.reply({ content: `${emoji.get("cross")} Prefix must be 1–5 characters with no spaces.` });
      if (["@", "#", "/", "\\", "<", ">"].some(x => prefix.includes(x))) return message.reply({ content: `${emoji.get("cross")} That prefix contains a reserved character.` });
      db.setUserPrefixes(message.author.id, [prefix]);
      return message.reply({ content: `${emoji.get("check")} Your Premium custom prefix is now \`${prefix}\`.` });
    }

    if (action === "resetprefix") {
      db.setUserPrefixes(message.author.id, []);
      return message.reply({ content: `${emoji.get("check")} Your Premium custom prefix has been reset.` });
    }

    return message.reply({ content: `${emoji.get("cross")} Use: ${this.usage}` });
  }
}

export default new PremiumUserCommand();