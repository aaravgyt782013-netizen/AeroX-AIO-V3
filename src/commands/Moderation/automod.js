import { PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";

export default {
  name: "automod",
  description: "Configure automatic moderation for this server.",
  usage: "automod <on|off|status|spam <count>|mentions <count>|links <on|off>|wordadd <word>|wordremove <word>",
  aliases: ["auto-mod", "am"],
  category: "Moderation",
  cooldown: 3,
  userPermissions: [PermissionFlagsBits.ManageGuild],
  permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages],
  enabledSlash: false,
  async execute({ message, args }) {
    const action = (args.shift() || "status").toLowerCase();
    const guildId = message.guild.id;
    const current = db.getAutoMod(guildId);
    const words = (() => { try { return JSON.parse(current.bad_words || "[]"); } catch { return []; } })();
    if (action === "status") {
      return message.reply({ embeds: [{
        color: current.enabled ? 0x2ecc71 : 0x95a5a6,
        title: "🛡️ AutoMod Settings",
        description: `Status: **${current.enabled ? "Enabled" : "Disabled"}**\nSpam threshold: **${current.spam_limit} messages / 6 seconds**\nMention threshold: **${current.mention_limit} users / message**\nBlock links: **${current.block_links ? "On" : "Off"}**\nFiltered words: **${words.length}**`,
        footer: { text: "Changes are saved persistently for this server." }
      }] });
    }
    if (action === "on" || action === "enable") db.setAutoMod(guildId, "enabled", 1);
    else if (action === "off" || action === "disable") db.setAutoMod(guildId, "enabled", 0);
    else if (action === "spam") {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 3 || n > 15) return message.reply("Use `automod spam <3-15>`.");
      db.setAutoMod(guildId, "spam_limit", n);
    } else if (action === "mentions") {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 2 || n > 15) return message.reply("Use `automod mentions <2-15>`.");
      db.setAutoMod(guildId, "mention_limit", n);
    } else if (action === "links") {
      const value = (args[0] || "").toLowerCase();
      if (!["on", "off"].includes(value)) return message.reply("Use `automod links <on|off>`.");
      db.setAutoMod(guildId, "block_links", value === "on" ? 1 : 0);
    } else if (action === "wordadd") {
      const word = args.join(" ").trim().toLowerCase();
      if (!word || word.length > 60) return message.reply("Use `automod wordadd <word or phrase>` (max 60 characters).");
      if (!words.includes(word)) words.push(word);
      db.setAutoMod(guildId, "bad_words", JSON.stringify(words.slice(0, 100)));
    } else if (action === "wordremove") {
      const word = args.join(" ").trim().toLowerCase();
      if (!word) return message.reply("Use `automod wordremove <word or phrase>`.");
      db.setAutoMod(guildId, "bad_words", JSON.stringify(words.filter(w => w !== word)));
    } else return message.reply("Commands: `automod on/off/status`, `automod spam <3-15>`, `automod mentions <2-15>`, `automod links on/off`, `automod wordadd <word>`, `automod wordremove <word>`.");
    return message.reply(`✅ AutoMod setting updated. Run ` + "`automod status`" + ` to review the configuration.`);
  }
};
