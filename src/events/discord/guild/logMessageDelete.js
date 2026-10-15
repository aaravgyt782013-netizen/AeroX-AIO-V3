import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "messageDelete",
  async execute(message) {
    if (!message.guild) return;

    // messageDelete may arrive without cached content/author. Fetch when possible.
    if (message.partial) {
      try { message = await message.fetch(); } catch {}
    }

    // Audit-log entries can arrive slightly after messageDelete. Wait briefly,
    // then only attribute the deletion when there is one unambiguous recent
    // entry for the same author and channel. Never guess an executor.
    let deleter = null;
    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const logs = await message.guild.fetchAuditLogs({
        type: AuditLogEvent.MessageDelete,
        limit: 10,
      });
      const matches = logs.entries.filter(item =>
        item.targetId === message.author?.id &&
        item.extra?.channel?.id === message.channelId &&
        Date.now() - item.createdTimestamp >= 0 &&
        Date.now() - item.createdTimestamp < 6000
      );
      if (matches.length === 1) {
        deleter = matches[0].executor || null;
      }
    } catch {
      // Missing View Audit Log permission is expected to leave executor unknown.
    }

    const content = String(message.content || "").trim();
    const fields = [
      { name: "Message author", value: message.author ? `<@${message.author.id}> (${message.author.tag})` : "Unknown (message was not cached)", inline: true },
      { name: "Deleted by", value: deleter ? `<@${deleter.id}> (${deleter.tag})` : "Unknown — Discord audit log unavailable or no matching entry", inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "Content", value: content ? content.slice(0, 3500) : "[content unavailable — message was not cached]", inline: false },
      { name: "Message ID", value: message.id, inline: true },
    ];

    await LoggingManager.send(message.guild, "message", {
      emoji: "🗑️",
      title: "Message Deleted",
      color: 0xED4245,
      description: "A message was deleted.",
      fields,
    });
  },
};
