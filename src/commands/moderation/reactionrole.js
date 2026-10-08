import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";

function emojiKey(raw) {
  const value = String(raw || "").trim();
  const custom = value.match(/^<a?:([A-Za-z0-9_]+):(\d{15,25})>$/);
  if (custom) return custom[2];
  const customShort = value.match(/^:([A-Za-z0-9_]+):$/);
  if (customShort) return customShort[1].toLowerCase();
  return value;
}

function resolveRole(message, raw) {
  return message.mentions.roles.first() || message.guild.roles.cache.get(String(raw || "").replace(/[<@&>]/g, ""));
}

function usage() {
  return [
    "🎭 **Reaction Roles**",
    "reactionrole panel [title] — create a panel message",
    "reactionrole add <messageId> <emoji> @role — bind a reaction",
    "reactionrole remove <messageId> <emoji> — remove a binding",
    "reactionrole list [messageId] — list bindings",
    "reactionrole clear <messageId> — remove all bindings from a message"
  ].join("\n");
}

async function run(message, args) {
  const sub = String(args[0] || "help").toLowerCase();
  if (sub === "help") return message.reply(usage());

  if (sub === "panel" || sub === "create") {
    const title = args.slice(1).join(" ").trim() || "🎭 Reaction Roles";
    const panel = await message.channel.send({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(title.slice(0, 256)).setDescription("React below to get or remove your server roles.\n\nAn administrator can configure each emoji with reactionrole add <messageId> <emoji> @role.").setFooter({ text: "LightCore • Reaction Roles" })]
    });
    return message.reply("✅ Reaction-role panel created. Message ID: " + panel.id);
  }

  const messageId = args[1];
  if (!messageId || !/^\d{15,25}$/.test(messageId)) return message.reply(usage());
  const target = await message.channel.messages.fetch(messageId).catch(() => null);
  if (!target) return message.reply("❌ I could not find that message in this channel.");

  if (sub === "add" || sub === "set") {
    const emoji = emojiKey(args[2]);
    const role = resolveRole(message, args[3]);
    if (!emoji || !role) return message.reply("❌ Usage: reactionrole add <messageId> <emoji> @role");
    if (role.managed || role.position >= message.guild.members.me.roles.highest.position) return message.reply("❌ I cannot manage that role. Move it below my highest role.");
    try { await target.react(args[2]); } catch { return message.reply("❌ I could not add that reaction. Check my Add Reactions permission and the emoji."); }
    db.guild.setReactionRole(message.guild.id, target.id, emoji, role.id, target.channelId);
    return message.reply("✅ " + args[2] + " → <@&" + role.id + "> is now configured.");
  }

  if (sub === "remove" || sub === "delete") {
    const emoji = emojiKey(args[2]);
    if (!emoji) return message.reply(usage());
    const removed = db.guild.removeReactionRole(message.guild.id, target.id, emoji);
    return message.reply(removed ? "✅ Removed the reaction-role binding." : "ℹ️ No reaction-role binding was found for that emoji.");
  }

  if (sub === "clear") {
    const removed = db.guild.clearReactionRoles(message.guild.id, target.id);
    return message.reply(removed ? "✅ Cleared all reaction-role bindings for that message." : "ℹ️ No bindings were configured for that message.");
  }

  if (sub === "list") {
    const data = db.guild.getReactionRoles(message.guild.id);
    const entries = Object.entries(data);
    if (!entries.length) return message.reply("ℹ️ No reaction roles are configured.");
    const lines = entries.map(([id, entry]) => "**Message:** " + id + "\n" + Object.entries(entry.roles || {}).map(([key, roleId]) => key + " → <@&" + roleId + ">").join("\n"));
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("🎭 Reaction Roles").setDescription(lines.join("\n\n").slice(0, 4000))] });
  }

  return message.reply(usage());
}

export default {
  name: "reactionrole",
  description: "Create and manage persistent reaction roles.",
  usage: "reactionrole <panel|add|remove|list|clear>",
  aliases: ["rr", "reactionroles"],
  category: "Moderation",
  cooldown: 3,
  userPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuild],
  permissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.AddReactions],
  enabledSlash: false,
  async execute({ message, args }) {
    try { return await run(message, args); }
    catch (error) { return message.reply("❌ Reaction-role system error: " + (error?.message || "unknown error")); }
  }
};