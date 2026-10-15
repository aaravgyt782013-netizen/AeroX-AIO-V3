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

    // Discord does not include the deleter in messageDelete. Resolve it from
    // the audit log when permissions and audit-log timing allow; bulk deletions
    // and self-deletions may not have a reliable matching entry.
    let deleter = null;
    try {
      const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 6 });
      const entry = logs.entries.find(item =>
        item.targetId === message.author?.id &&
        item.extra?.channel?.id === message.channelId &&
        Date.now() - item.createdTimestamp < 8000
      );
      if (entry) deleter = entry.executor || null;
    } catch {}

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
