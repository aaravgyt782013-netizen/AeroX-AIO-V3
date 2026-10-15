import { Command } from "#structures/classes/Command";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";

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
    const targetMembers = [...members.values()].filter((member) => member.user.bot === targetBots);
    const eligible = targetMembers.filter((member) =>
      !member.roles.cache.has(role.id) && member.manageable && member.id !== botMember.id
    );
    const alreadyHasRole = targetMembers.filter((member) => member.roles.cache.has(role.id)).length;
    const unmanageable = targetMembers.length - eligible.length - alreadyHasRole;
    const startedAt = Date.now();
    const estimateSeconds = Math.ceil(eligible.length * 0.35);
    const estimate = estimateSeconds < 60
      ? `about ${estimateSeconds} sec`
      : `about ${Math.ceil(estimateSeconds / 60)} min`;

    const progressEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🛡️ Role-all operation")
      .setDescription("I'm applying the selected role. This may take a while for large servers.")
      .addFields(
        { name: "Target", value: targetBots ? "Bots" : "Humans", inline: true },
        { name: "Role", value: `<@&${role.id}>`, inline: true },
        { name: "Eligible users", value: String(eligible.length), inline: true },
        { name: "Estimated time", value: estimate, inline: true },
        { name: "Already had role", value: String(alreadyHasRole), inline: true },
        { name: "Not manageable", value: String(unmanageable), inline: true },
      )
      .setFooter({ text: "Estimate is approximate; Discord rate limits can change it." })
      .setTimestamp();

    const status = await message.reply({ embeds: [progressEmbed] });
    let added = 0;
    let skipped = alreadyHasRole + unmanageable;
    let failed = 0;

    for (let index = 0; index < eligible.length; index++) {
      const member = eligible[index];
      try {
        await member.roles.add(role, `LightCore roleall ${targetBots ? "bots" : "humans"} by ${message.author.tag}`);
        added++;
      } catch (error) {
        failed++;
        message.client.logger?.warn("RoleAll", `Failed to add role to ${member.id}`, error);
      }

      // Keep the progress panel useful without flooding Discord with edits.
      if ((index + 1) % 10 === 0 || index === eligible.length - 1) {
        const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
        const rate = (index + 1) / elapsed;
        const remaining = Math.ceil((eligible.length - index - 1) / Math.max(0.1, rate));
        const remainingText = remaining < 60 ? `~${remaining}s remaining` : `~${Math.ceil(remaining / 60)}m remaining`;
        progressEmbed.setDescription("⏳ **Applying role…**\n" + `Progress: **${index + 1}/${eligible.length}** eligible users processed\n${remainingText}`);
        progressEmbed.setFields(
          { name: "Target", value: targetBots ? "Bots" : "Humans", inline: true },
          { name: "Role", value: `<@&${role.id}>`, inline: true },
          { name: "Added", value: String(added), inline: true },
          { name: "Skipped", value: String(skipped), inline: true },
          { name: "Failed", value: String(failed), inline: true },
        );
        await status.edit({ embeds: [progressEmbed] }).catch(() => {});
      }
    }

    progressEmbed
      .setColor(failed ? 0xF1C40F : 0x2ECC71)
      .setDescription("✅ **Role-all complete**")
      .setFields(
        { name: "Target", value: targetBots ? "Bots" : "Humans", inline: true },
        { name: "Role", value: `<@&${role.id}>`, inline: true },
        { name: "Eligible users", value: String(eligible.length), inline: true },
        { name: "Successfully added", value: String(added), inline: true },
        { name: "Skipped", value: String(skipped), inline: true },
        { name: "Failed", value: String(failed), inline: true },
        { name: "Actual time", value: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} sec`, inline: true },
      )
      .setFooter({ text: "LightCore • Role-all summary" })
      .setTimestamp();
    return status.edit({ embeds: [progressEmbed] });
  }
}

export default new RoleAll();
