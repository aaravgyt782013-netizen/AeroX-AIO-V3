import { ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";

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

const LOG_STYLE = {
  member: { emoji: "👤", color: 0x57F287, label: "Member Activity" },
  message: { emoji: "💬", color: 0x5865F2, label: "Message Activity" },
  moderation: { emoji: "🛡️", color: 0xED4245, label: "Moderation Action" },
  role: { emoji: "🎭", color: 0x9B59B6, label: "Role Activity" },
  channel: { emoji: "📁", color: 0x3498DB, label: "Channel Activity" },
  server: { emoji: "🏠", color: 0xF1C40F, label: "Server Activity" },
  voice: { emoji: "🔊", color: 0x2ECC71, label: "Voice Activity" },
  invite: { emoji: "🔗", color: 0x1ABC9C, label: "Invite Activity" },
  emoji: { emoji: "😀", color: 0xF39C12, label: "Emoji Activity" },
  thread: { emoji: "🧵", color: 0x95A5A6, label: "Thread Activity" },
  webhook: { emoji: "🪝", color: 0x7289DA, label: "Webhook Activity" },
  automod: { emoji: "🤖", color: 0xE67E22, label: "AutoMod Activity" },
  command: { emoji: "⚡", color: 0x00B0F4, label: "Command Activity" },
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
      const channel = data.channelId
        ? guild.channels.cache.get(data.channelId)
        : this.getChannel(guild, type);
      if (!channel?.isTextBased()) return false;

      const style = LOG_STYLE[type] || LOG_STYLE.server;
      const title = data.title || style.label;
      const description = data.description || "No details provided.";
      const fields = Array.isArray(data.fields) ? data.fields.slice(0, 25) : [];

      if (data.action) fields.unshift({ name: "Action", value: String(data.action).slice(0, 1024), inline: true });
      if (data.target) fields.push({ name: "Target", value: String(data.target).slice(0, 1024), inline: true });
      if (data.executor) fields.push({ name: "Executor", value: String(data.executor).slice(0, 1024), inline: true });
      if (data.channel) fields.push({ name: "Channel", value: String(data.channel).slice(0, 1024), inline: true });

      const e = new EmbedBuilder()
        .setColor(data.color ?? style.color)
        .setAuthor({
          name: `LightCore • ${style.label}`,
          iconURL: guild.client.user?.displayAvatarURL?.({ size: 64 }) || undefined,
        })
        .setTitle(`${data.emoji || style.emoji}  ${title}`)
        .setDescription(description)
        .setTimestamp(data.timestamp || new Date())
        .setFooter({
          text: `${guild.name} • LightCore Audit`,
          iconURL: guild.iconURL() || undefined,
        });

      if (fields.length) e.addFields(fields.slice(0, 25));
      if (data.author) e.setAuthor(data.author);
      if (data.thumbnail) e.setThumbnail(data.thumbnail);
      if (data.image) e.setImage(data.image);

      await channel.send({ embeds: [e] });
      return true;
    } catch {
      return false;
    }
  }

  static async executor(guild, action, targetId) {
    try {
      const logs = await guild.fetchAuditLogs({ type: action, limit: 5 });
      const entry = logs.entries.find(x => x.targetId === targetId && Date.now() - x.createdTimestamp < 10000);
      return entry?.executor || null;
    } catch { return null; }
  }
}
