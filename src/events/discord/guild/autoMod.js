import { PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

const recentMessages = new Map();
const warnedAt = new Map();
const LINK_REGEX = /(?:https?:\/\/|www\.)\S+/i;

export default {
  name: "messageCreate",
  async execute(message) {
    try {
      if (!message.guild || message.author.bot || !message.member) return;
      const settings = db.getAutoMod(message.guild.id);
      if (!settings?.enabled) return;
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
          message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

      const content = String(message.content || "").toLowerCase();
      const words = (() => { try { return JSON.parse(settings.bad_words || "[]"); } catch { return []; } })();
      let reason = "";
      const mentions = message.mentions.users.size + message.mentions.roles.size;
      if (mentions >= Number(settings.mention_limit || 5)) reason = "Excessive mentions";
      else if (settings.block_links && LINK_REGEX.test(content)) reason = "Links are disabled in this server";
      else if (words.some(word => word && content.includes(String(word).toLowerCase()))) reason = "Filtered word/phrase";

      const key = message.guild.id + ":" + message.author.id;
      const now = Date.now();
      const recent = (recentMessages.get(key) || []).filter(t => now - t < 6000);
      recent.push(now);
      recentMessages.set(key, recent);
      if (!reason && recent.length >= Number(settings.spam_limit || 5)) reason = "Message spam";

      if (!reason) return;
      await message.delete().catch(() => null);
      const warningKey = key;
      if (now - (warnedAt.get(warningKey) || 0) < 4000) return;
      warnedAt.set(warningKey, now);
      const warning = await message.channel.send({ content: `⚠️ <@${message.author.id}>, your message was removed: **${reason}**.`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
      if (warning) setTimeout(() => warning.delete().catch(() => {}), 6000);
    } catch (error) {
      logger.error("AutoMod", "Failed to process message", error);
    }
  }
};
