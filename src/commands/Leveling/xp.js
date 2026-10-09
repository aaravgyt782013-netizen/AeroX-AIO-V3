import { Command } from "#structures/classes/Command";
import { leveling } from "#managers/LevelingManager";

class XpCommand extends Command {
  constructor() {
    super({
      name: "xp",
      description: "Manage a member's XP (Manage Server required)",
      usage: "xp <add|remove|set|reset> <@member> [amount]",
      aliases: ["levelxp"],
      category: "Leveling",
      cooldown: 3,
    });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!message.member.permissions.has("ManageGuild")) return message.reply("You need **Manage Server** permission to manage XP.");
    const action = (args[0] || "").toLowerCase();
    const user = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1].replace(/[<@!>]/g, "")).catch(() => null) : null);
    if (!["add", "remove", "set", "reset"].includes(action) || !user) {
      return message.reply("Usage: `xp <add|remove|set|reset> <@member|user ID> [amount]`");
    }
    let result;
    if (action === "reset") result = leveling.resetMember(message.guild.id, user.id);
    else {
      const amount = Number(args[2]);
      if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) return message.reply("Amount must be a non-negative whole number.");
      if (action === "set") result = leveling.setXp(message.guild.id, user.id, amount);
      if (action === "add") result = leveling.addXp(message.guild.id, user.id, amount);
      if (action === "remove") result = leveling.setXp(message.guild.id, user.id, Math.max(0, leveling.getRank(message.guild.id, user.id).xp - amount));
    }
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member) await leveling.applyRewards(member, result.level);
    return message.reply(`✅ Updated <@${user.id}>: **Level ${result.level}**, **${result.xp.toLocaleString("en-US")} XP**.`);
  }
}

export default new XpCommand();
