import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "channelUpdate",
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push({ name: "Name", value: ` ${oldChannel.name} → ${newChannel.name} `.slice(0, 1024) });
    if (oldChannel.parentId !== newChannel.parentId) changes.push({ name: "Category", value: `${oldChannel.parent?.name || "None"} → ${newChannel.parent?.name || "None"}`.slice(0, 1024) });
    if (oldChannel.topic !== newChannel.topic && ("topic" in oldChannel)) changes.push({ name: "Topic", value: `Before: ${oldChannel.topic || "None"}\nAfter: ${newChannel.topic || "None"}`.slice(0, 1024) });
    if (oldChannel.nsfw !== newChannel.nsfw && ("nsfw" in oldChannel)) changes.push({ name: "NSFW", value: `${oldChannel.nsfw} → ${newChannel.nsfw}`, inline: true });
    if (!changes.length) return;
    const executor = await LoggingManager.executor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    changes.push({ name: "Executor", value: executor ? `<@${executor.id}>` : "Unknown — audit log unavailable or permission missing", inline: true });
    await LoggingManager.send(newChannel.guild, "channel", {
      emoji: "✏️", title: "Channel Updated", color: 0xFEE75C,
      description: `Changes detected in <#${newChannel.id}>.`,
      fields: changes
    });
  }
};
