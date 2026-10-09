import { Command, } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { leveling } from "#managers/LevelingManager";

class RewardsCommand extends Command {
  constructor() {
    super({
      name: "rewards",
      description: "View or configure automatic level-up role rewards",
      usage: "rewards [add <level> <@role>|remove <level> [@role]]",
      aliases: ["levelrewards", "rolerewards"],
      category: "Leveling",
      cooldown: 4,
    });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const action = (args[0] || "list").toLowerCase();
    if (action === "add" || action === "remove") {
      if (!message.member.permissions.has("ManageRoles") && !message.member.permissions.has("ManageGuild")) {
        return message.reply("You need **Manage Roles** or **Manage Server** permission to configure level rewards.");
      }
      const level = Number.parseInt(args[1], 10);
      const role = message.mentions.roles.first() || (args[2] ? await message.guild.roles.fetch(args[2].replace(/[<@&>]/g, "")).catch(() => null) : null);
      if (!Number.isInteger(level) || level < 1) return message.reply("Provide a level of 1 or higher.");
      if (action === "add") {
        if (!role) return message.reply("Mention a role to reward, e.g. `rewards add 10 @Level10`.");
        if (!role.editable) return message.reply("I can't manage that role. Move LightCore's role above it.");
        leveling.addReward(message.guild.id, level, role.id);
        return message.reply(`✅ Added ${role} as a reward at **Level ${level}**.`);
      }
      leveling.removeReward(message.guild.id, level, role?.id || null);
      return message.reply(`✅ Removed level rewards for **Level ${level}**${role ? ` (${role})` : ""}.`);
    }

    const rows = leveling.getRewards(message.guild.id);
    const lines = await Promise.all(rows.map(async (item) => {
      const role = message.guild.roles.cache.get(item.role_id) || await message.guild.roles.fetch(item.role_id).catch(() => null);
      return `**Level ${item.level}** — ${role ? role.toString() : "`deleted role`"}`;
    }));
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎁 LightCore Level Rewards")
      .setDescription(lines.length ? lines.join("\n") : "No level rewards are configured yet.\n\nUse `rewards add <level> @role` to create one.")
      .setFooter({ text: "Members receive eligible roles when they level up." });
    return message.reply({ embeds: [embed] });
  }
}

export default new RewardsCommand();
