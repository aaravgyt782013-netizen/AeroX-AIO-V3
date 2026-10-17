import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "webhooksUpdate",
  async execute(channel) {
    if (!channel.guild) return;
    await LoggingManager.send(channel.guild, "webhook", {
      emoji: "🪝",
      title: "Webhook Configuration Changed",
      color: 0x7289DA,
      description: `Webhook configuration changed in <#${channel.id}>. Discord's gateway event does not identify which webhook changed; check the server audit log for the exact action and executor.`,
      fields: [
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Channel ID", value: String(channel.id), inline: true }
      ]
    });
  }
};
