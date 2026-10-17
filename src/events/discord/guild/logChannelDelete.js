import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "channelDelete",
  async execute(channel) {
    const guild = channel.guild;
    if (!guild) return;
    const executor = await LoggingManager.executor(guild, AuditLogEvent.ChannelDelete, channel.id);
    await LoggingManager.send(guild, "channel", {
      emoji: "🗑️",
      title: "Channel Deleted",
      color: 0xED4245,
      description: `**${channel.name || "Unknown channel"}** was deleted.`,
      fields: [
        { name: "Channel name", value: String(channel.name || "Unknown"), inline: true },
        { name: "Channel ID", value: String(channel.id), inline: true },
        { name: "Type", value: String(channel.type), inline: true },
        { name: "Executor", value: executor ? `<@${executor.id}>` : "Unknown — audit log unavailable or permission missing", inline: true }
      ]
    });
  }
};
