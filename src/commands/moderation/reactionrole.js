import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";

function emojiKey(raw, guild) {
  const value = String(raw || "").trim();
  const custom = value.match(/^<a?:([A-Za-z0-9_]+):(\d{15,25})>$/);
  if (custom) return custom[2];
  const customShort = value.match(/^:([A-Za-z0-9_]+):$/);
  if (customShort) return guild?.emojis?.cache?.find(e => e.name?.toLowerCase() === customShort[1].toLowerCase())?.id || customShort[1].toLowerCase();
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