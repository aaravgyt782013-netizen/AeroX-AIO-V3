import { ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";

export const LOG_TYPES = {
  member: "member-logs",
  message: "message-logs",
  moderation: "moderation-logs",
  role: "role-logs",
  channel: "channel-logs",
  server: "server-logs",
  voice: "voice-logs",
  invite: "invite-logs",
  emoji: "emoji-logs",
  thread: "thread-logs",
  webhook: "webhook-logs",
  automod: "automod-logs",
  command: "command-logs",
};

export class LoggingManager {
  static async setup(guild) {
    const me = guild.members.me || await guild.members.fetchMe();
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === "LIGHTCORE LOGS");
    if (!category) {
      category = await guild.channels.create({
        name: "LIGHTCORE LOGS",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
        ],
        reason: "LightCore automatic logging setup",
      });
    } else {
      await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(() => null);
      await category.permissionOverwrites.edit(me, { ViewChannel: true, SendMessages: true, EmbedLinks: true, ManageChannels: true }).catch(() => null);
    }

    const channels = {};
    for (const [type, name] of Object.entries(LOG_TYPES)) {
      let ch = guild.channels.cache.find(c => c.parentId === category.id && c.name === name && c.type === ChannelType.GuildText);
      if (!ch) {
        ch = await guild.channels.create({
          name,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: "LightCore " + type + " audit log",
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
          ],
          reason: "LightCore automatic logging setup",
        });
      }
      channels[type] = ch.id;
    }
    db.guild.setLogging(guild.id, channels, true);
    return { category, channels };
  }

  static getChannel(guild, type) {
    const cfg = db.guild.getLogging(guild.id);
    if (!cfg.enabled) return null;
    const id = cfg.channels[type] || cfg.channels.server || null;
    return id ? guild.channels.cache.get(id) : null;
  }

  static async send(guild, type, data = {}) {
    try {
      const channel = this.getChannel(guild, type);
      if (!channel?.isTextBased()) return false;
      const e = new EmbedBuilder()
        .setColor(data.color ?? 0x5865F2)
        .setTitle((data.emoji || "📋") + " " + (data.title || "Server Activity"))
        .setDescription(data.description || "No details provided.")
        .setTimestamp(data.timestamp || new Date())
        .setFooter({ text: "LightCore Logging • " + guild.name, iconURL: guild.iconURL() || undefined });
      if (data.fields?.length) e.addFields(data.fields.slice(0, 25));
      if (data.author) e.setAuthor(data.author);
      if (data.thumbnail) e.setThumbnail(data.thumbnail);
      await channel.send({ embeds: [e] });
      return true;
    } catch { return false; }
  }

  static async executor(guild, action, targetId) {
    try {
      const logs = await guild.fetchAuditLogs({ type: action, limit: 5 });
      const entry = logs.entries.find(x => x.targetId === targetId && Date.now() - x.createdTimestamp < 10000);
      return entry?.executor || null;
    } catch { return null; }
  }
}
