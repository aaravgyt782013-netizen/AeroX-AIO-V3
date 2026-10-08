import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";

function emojiKey(raw) {
  const value = String(raw || "").trim();
  const custom = value.match(/^<a?:[^:>]+:(\\d+)>$/);
  return custom ? "id:" + custom[1] : "u:" + value;
}

function roleFrom(guild, raw) {
  const id = String(raw || "").match(/^(?:<@&)?(\\d{15,25})>?$/)?.[1];
  return id ? guild.roles.cache.get(id) || null : null;
}

async function fetchMessage(channel, messageId) {
  return channel.messages.fetch(messageId).catch(() => null);
}

function usage() {
  return "Usage: .reactionrole add <messageId> <emoji> <@role>\\n" +
    ".reactionrole remove <messageId> <emoji>\\n" +
    ".reactionrole list [messageId]\\n" +
    ".reactionrole clear <messageId>";
}

export default {
  name: "reactionrole",
  description: "Create persistent reaction-based self-roles.",
  usage: "reactionrole add <messageId> <emoji> <@role>",
  aliases: ["rr", "reactionroles"],
  category: "Moderation",
  cooldown: 3,
  userPermissions: [PermissionFlagsBits.ManageRoles],
  permissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory],
  enabledSlash: true,
  slashData: {
    name: "reactionrole",
    description: "Manage reaction-based self-roles.",
    options: [
      { name: "add", description: "Map a reaction on a message to a role.", type: 1, options: [
        { name: "message", description: "Message ID.", type: 3, required: true },
        { name: "emoji", description: "Unicode or custom emoji.", type: 3, required: true },
        { name: "role", description: "Role to give/remove.", type: 8, required: true },
      ]},
      { name: "remove", description: "Remove one reaction-role mapping.", type: 1, options: [
        { name: "message", description: "Message ID.", type: 3, required: true },
        { name: "emoji", description: "Unicode or custom emoji.", type: 3, required: true },
      ]},
      { name: "list", description: "List reaction-role mappings.", type: 1, options: [
        { name: "message", description: "Optional message ID.", type: 3, required: false },
      ]},
      { name: "clear", description: "Remove all mappings for one message.", type: 1, options: [
        { name: "message", description: "Message ID.", type: 3, required: true },
      ]},
    ],
  },

  async execute({ message, args }) {
    const sub = String(args[0] || "list").toLowerCase();
    if (!["add","remove","list","clear"].includes(sub)) return message.reply(usage());

    if (sub === "list") {
      const messageId = args[1];
      const data = db.guild.getReactionRoles(message.guild.id);
      const entries = [];
      for (const [mid, mappings] of Object.entries(data)) {
        if (messageId && mid !== messageId) continue;
        for (const [key, roleId] of Object.entries(mappings || {})) {
          entries.push("• \`" + key.replace(/^u:/,"") + "\` → <@&" + roleId + "> (message " + mid + ")");
        }
      }
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("🎭 LightCore Reaction Roles")
          .setDescription(entries.length ? entries.join("\\n").slice(0,4096) : "No reaction roles configured.")
          .setFooter({ text: "React to a configured message to get the role." })]
      });
    }

    const messageId = args[1];
    if (!/^\\d{15,25}$/.test(messageId || "")) return message.reply(usage());
    const channel = message.channel;
    const target = await fetchMessage(channel, messageId);
    if (!target) return message.reply("❌ I couldn't fetch that message. Use the command in the same channel as the target message.");
    
    if (sub === "add") {
      const rawEmoji = args[2];
      const role = roleFrom(message.guild, args[3]);
      if (!rawEmoji || !role) return message.reply(usage());
      const botMember = message.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply("❌ I need **Manage Roles**.");
      if (role.managed) return message.reply("❌ That role is managed by an integration and cannot be assigned.");
      if (botMember.roles.highest.comparePositionTo(role) <= 0) return message.reply("❌ Move my bot role above the target role first.");
      try {
        await target.react(rawEmoji);
      } catch (error) {
        return message.reply("❌ I couldn't add that reaction. Check the emoji and my Add Reactions permission.");
      }
      db.guild.setReactionRole(message.guild.id, messageId, emojiKey(rawEmoji), role.id);
      return message.reply("✅ Reaction role added: " + rawEmoji + " → <@&" + role.id + ">.");
    }

    const rawEmoji = args[2];
    if (!rawEmoji) return message.reply(usage());
    if (sub === "remove") {
      db.guild.removeReactionRole(message.guild.id, messageId, emojiKey(rawEmoji));
      return message.reply("✅ Reaction-role mapping removed.");
    }

    db.guild.clearReactionRoles(message.guild.id, messageId);
    for (const reaction of target.reactions.cache.values()) {
      const key = reaction.emoji.id ? "id:" + reaction.emoji.id : "u:" + (reaction.emoji.name || "");
      if (db.guild.getReactionRoles(message.guild.id)[messageId]?.[key] === undefined) {
        await reaction.users.remove(message.client.user.id).catch(() => {});
      }
    }
    return message.reply("✅ All reaction roles for that message were cleared.");
  },

  async slashExecute({ interaction }) {
    const sub = interaction.options.getSubcommand();
    const messageId = interaction.options.getString("message");
    if (sub === "list") {
      const data = db.guild.getReactionRoles(interaction.guild.id);
      const entries = [];
      for (const [mid, mappings] of Object.entries(data)) {
        if (messageId && mid !== messageId) continue;
        for (const [key, roleId] of Object.entries(mappings || {})) entries.push("• \`" + key.replace(/^u:/,"") + "\` → <@&" + roleId + "> (message " + mid + ")");
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("🎭 LightCore Reaction Roles").setDescription(entries.length ? entries.join("\\n").slice(0,4096) : "No reaction roles configured.")] , ephemeral: true });
    }

    if (sub === "remove" || sub === "clear") {
      const mid = interaction.options.getString("message", true);
      if (sub === "clear") db.guild.clearReactionRoles(interaction.guild.id, mid);
      else db.guild.removeReactionRole(interaction.guild.id, mid, emojiKey(interaction.options.getString("emoji", true)));
      return interaction.reply({ content: sub === "clear" ? "✅ Reaction roles cleared." : "✅ Reaction-role mapping removed.", ephemeral: true });
    }

    const mid = interaction.options.getString("message", true);
    const rawEmoji = interaction.options.getString("emoji", true);
    const role = interaction.options.getRole("role", true);
    const target = await fetchMessage(interaction.channel, mid);
    if (!target) return interaction.reply({ content: "❌ I couldn't fetch that message in this channel.", ephemeral: true });
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({content:"❌ I need Manage Roles.",ephemeral:true});
    if (role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) return interaction.reply({content:"❌ Move my bot role above the target role first.",ephemeral:true});
    try { await target.react(rawEmoji); } catch { return interaction.reply({content:"❌ I couldn't add that reaction. Check the emoji and my permissions.",ephemeral:true}); }
    db.guild.setReactionRole(interaction.guild.id, mid, emojiKey(rawEmoji), role.id);
    return interaction.reply({content:"✅ Reaction role added: " + rawEmoji + " → <@&" + role.id + ">.",ephemeral:true});
  },
};
