import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits } from "discord.js";

class RoleAll extends Command {
  constructor() {
    super({
      name: "roleall",
      description: "Give a role to all humans or all bots in the server",
      usage: "roleall <human|bots> <@role|role ID>",
      examples: ["roleall human @Member", "roleall bots @Bots"],
      aliases: ["massrole"],
      category: "Moderation",
      userPermissions: [PermissionFlagsBits.ManageRoles],
      permissions: [PermissionFlagsBits.ManageRoles],
      cooldown: 10,
    });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const mode = String(args[0] || "").toLowerCase();
    if (!["human", "humans", "bot", "bots"].includes(mode)) {
      return message.reply("❌ Usage: `.roleall human @role` or `.roleall bots @role`");
    }

    const roleToken = args.find((arg) => /^<@&?\d{17,20}>$/.test(arg) || /^\d{17,20}$/.test(arg));
    const roleId = message.mentions.roles.first()?.id || String(roleToken || "").replace(/[<@&>]/g, "");
    const role = roleId ? message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null) : null;
    if (!role) return message.reply("❌ Mention a valid role or provide its role ID. Example: `.roleall human @Member`");

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember) return message.reply("❌ I couldn't verify my server member permissions. Try again.");
    if (role.managed || role.id === message.guild.id || role.position >= botMember.roles.highest.position) {
      return message.reply("❌ I cannot manage that role because it is managed or at/above my highest role.");
    }

    let members;
    try {
      members = await message.guild.members.fetch();
    } catch (error) {
      message.client.logger?.error("RoleAll", error);
      return message.reply("❌ I couldn't fetch the full member list. Ensure the **Server Members Intent** is enabled for the bot and try again.");
    }

    const targetBots = mode === "bot" || mode === "bots";
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const member of members.values()) {
      if (member.user.bot !== targetBots || member.roles.cache.has(role.id)) {
        skipped++;
        continue;
      }
      if (!member.manageable || member.id === botMember.id) {
        skipped++;
        continue;
      }
      try {
        await member.roles.add(role, `LightCore roleall ${targetBots ? "bots" : "humans"} by ${message.author.tag}`);
        added++;
      } catch (error) {
        failed++;
        message.client.logger?.warn("RoleAll", `Failed to add role to ${member.id}`, error);
      }
    }

    return message.reply(
      `✅ **Role-all complete**\nTarget: **${targetBots ? "Bots" : "Humans"}**\nRole: <@&${role.id}>\nAdded: **${added}** · Skipped: **${skipped}** · Failed: **${failed}**`,
    );
  }
}

export default new RoleAll();
