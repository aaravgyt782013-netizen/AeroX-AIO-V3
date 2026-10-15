import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits } from "discord.js";

class RoleAll extends Command {
  constructor() {
    super({
      name: "roleall",
      description: "Give a role to all humans or all bots in the server",
      usage: "roleall <human|bots> @role",
      aliases: ["massrole"],
      category: "Moderation",
      userPermissions: [PermissionFlagsBits.ManageRoles],
      permissions: [PermissionFlagsBits.ManageRoles],
      cooldown: 10,
    });
  }

  async execute({ message, args }) {
    const mode = String(args[0] || "").toLowerCase();
    if (!["human", "humans", "bot", "bots"].includes(mode)) {
      return message.reply("❌ Usage: `.roleall human @role` or `.roleall bots @role`");
    }

    const role = message.mentions.roles.first()
      || message.guild.roles.cache.get(String(args.find(a => /^<@&?\d+>$/.test(a) || /^\d{17,20}$/.test(a)) || "").replace(/[<@&>]/g, ""));
    if (!role) return message.reply("❌ Mention a role. Example: `.roleall human @Member`");
    if (role.managed || role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply("❌ I cannot manage that role because it is managed or above my highest role.");
    }

    await message.guild.members.fetch();
    const targetBots = ["bot", "bots"].includes(mode);
    let added = 0, skipped = 0, failed = 0;

    for (const [, member] of message.guild.members.cache) {
      if (member.user.bot !== targetBots || member.roles.cache.has(role.id)) { skipped++; continue; }
      if (!member.manageable) { skipped++; continue; }
      try {
        await member.roles.add(role, `LightCore roleall ${targetBots ? "bots" : "humans"} by ${message.author.tag}`);
        added++;
      } catch { failed++; }
    }

    return message.reply(`✅ **Role-all complete**\nTarget: **${targetBots ? "Bots" : "Humans"}**\nRole: <@&${role.id}>\nAdded: **${added}** · Skipped: **${skipped}** · Failed: **${failed}**`);
  }
}
export default new RoleAll();
