import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";

function emojiKey(raw, guild) {
  const value = String(raw || "").trim();
  const custom = value.match(/^<a?:([A-Za-z0-9_]+):(\d{15,25})>$/);
  if (custom) return custom[2];
  const short = value.match(/^:([A-Za-z0-9_]+):$/);
  if (short) return guild?.emojis?.cache?.find(e => e.name?.toLowerCase() === short[1].toLowerCase())?.id || short[1].toLowerCase();
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

function listReply(guildId, messageId) {
  const data = db.guild.getReactionRoles(guildId);
  const entries = messageId && /^\d{15,25}$/.test(messageId) ? [[messageId, data[messageId]]].filter(([, value]) => value) : Object.entries(data);
  if (!entries.length) return null;
  const lines = entries.map(([id, entry]) => {
    const bindings = Object.entries(entry.roles || {}).map(([key, roleId]) => key + " → <@&" + roleId + ">").join("\n");
    return "**Message:** " + id + "\n" + (bindings || "No bindings");
  });
  return new EmbedBuilder().setColor(0x5865F2).setTitle("🎭 Reaction Roles").setDescription(lines.join("\n\n").slice(0, 4000));
}

async function run(message, args) {
  const sub = String(args[0] || "help").toLowerCase();
  if (sub === "help") return message.reply(usage());

  if (sub === "panel" || sub === "create") {
    const title = args.slice(1).join(" ").trim() || "🎭 Reaction Roles";
    const panel = await message.channel.send({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(title.slice(0, 256)).setDescription("React below to get or remove your server roles.\n\nUse reactionrole add <messageId> <emoji> @role to configure a reaction.").setFooter({ text: "LightCore • Reaction Roles" })]
    });
    return message.reply("✅ Reaction-role panel created. Message ID: " + panel.id);
  }

  if (sub === "list") {
    const embed = listReply(message.guild.id, args[1]);
    return message.reply(embed ? { embeds: [embed] } : "ℹ️ No reaction roles are configured.");
  }

  const messageId = args[1];
  if (!messageId || !/^\d{15,25}$/.test(messageId)) return message.reply(usage());
  const target = await message.channel.messages.fetch(messageId).catch(() => null);
  if (!target) return message.reply("❌ I could not find that message in this channel.");

  if (sub === "add" || sub === "set") {
    const rawEmoji = args[2];
    const key = emojiKey(rawEmoji, message.guild);
    const role = resolveRole(message, args[3]);
    if (!rawEmoji || !role) return message.reply("❌ Usage: reactionrole add <messageId> <emoji> @role");
    if (role.managed || role.position >= message.guild.members.me.roles.highest.position) return message.reply("❌ I cannot manage that role. Move it below my highest role.");
    try { await target.react(rawEmoji); } catch { return message.reply("❌ I could not add that reaction. Check my Add Reactions permission and the emoji."); }
    db.guild.setReactionRole(message.guild.id, target.id, key, role.id, target.channelId);
    return message.reply("✅ " + rawEmoji + " → <@&" + role.id + "> is now configured.");
  }

  if (sub === "remove" || sub === "delete") {
    const key = emojiKey(args[2], message.guild);
    if (!key) return message.reply(usage());
    const removed = db.guild.removeReactionRole(message.guild.id, target.id, key);
    return message.reply(removed ? "✅ Removed the reaction-role binding." : "ℹ️ No reaction-role binding was found for that emoji.");
  }

  if (sub === "clear") {
    const removed = db.guild.clearReactionRoles(message.guild.id, target.id);
    return message.reply(removed ? "✅ Cleared all reaction-role bindings for that message." : "ℹ️ No bindings were configured for that message.");
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