import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import emoji from "#config/emoji";

class PremiumGuildCommand extends Command {
  constructor() {
    super({
      name: "premiumguild",
      description: "Grant or revoke Guild Premium",
      usage: "premiumguild <add|remove> <guild_id> [duration]",
      aliases: ["guildpremium"],
      category: "Owner",
      cooldown: 0,
      ownerOnly: true,
    });
  }

  async execute({ message, args }) {
    if (!config.ownerIds?.includes(message.author.id)) return message.reply({ content: `${emoji.get("cross")} Owner only.` });
    const action = args[0]?.toLowerCase();
    const guildId = args[1]?.replace(/[<@!>]/g, "");
    if (!["add", "remove"].includes(action) || !/^\d{17,20}$/.test(guildId || "")) {
      return message.reply({ content: `${emoji.get("cross")} Usage: ${this.usage}\nDuration: 30d, 12h, 60m, or lifetime.` });
    }
    if (action === "remove") {
      db.revokeGuildPremium(guildId);
      return message.reply({ content: `${emoji.get("check")} Guild Premium revoked for ${guildId}.` });
    }
    const duration = args[2]?.toLowerCase() || "lifetime";
    let expiresAt = null;
    if (duration !== "lifetime") {
      const match = duration.match(/^(\d+)(d|h|m)$/);
      if (!match) return message.reply({ content: `${emoji.get("cross")} Invalid duration.` });
      const multipliers = { d: 86400000, h: 3600000, m: 60000 };
      expiresAt = Date.now() + Number(match[1]) * multipliers[match[2]];
    }
    db.grantGuildPremium(guildId, message.author.id, expiresAt, "Granted with premiumguild");
    return message.reply({ content: `${emoji.get("premium")} Guild Premium granted to ${guildId} — ${duration === "lifetime" ? "Lifetime" : duration}.` });
  }
}

export default new PremiumGuildCommand();