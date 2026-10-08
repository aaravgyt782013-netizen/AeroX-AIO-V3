import { Command } from "#structures/classes/Command";
import { ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { LoggingManager } from "#managers/LoggingManager";

const MAX_RUNTIME = 210000;
const DELETE_CONCURRENCY = 5;
const PER_CHANNEL_TIMEOUT = 20000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function resolveCategory(guild, raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const id = value.match(/^(?:<#)?(\d{15,25})>?$/)?.[1];
  if (id) {
    const channel = guild.channels.cache.get(id);
    return channel?.type === ChannelType.GuildCategory ? channel : null;
  }

  const matches = guild.channels.cache.filter(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === value.toLowerCase(),
  );
  return matches.size === 1 ? matches.first() : matches.size > 1 ? "multiple" : null;
}

class CategoryDelete extends Command {
  constructor() {
    super({
      name: "categorydelete",
      description: "Delete a category and all channels inside it.",
      usage: "categorydelete <category name | category ID>",
      aliases: ["catdelete", "delcategory", "categorydel"],
      category: "Moderation",
      cooldown: 10,
      userPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.ManageChannels],
      enabledSlash: true,
      slashData: {
        name: "categorydelete",
        description: "Delete a category and every channel inside it.",
        options: [{
          name: "category",
          description: "Category ID or exact category name.",
          type: 3,
          required: true,
        }],
      },
    });
  }

  async execute({ message, args }) {
    const raw = Array.isArray(args) ? args.join(" ").trim() : "";
    return this.runDelete({
      guild: message.guild,
      raw,
      reply: payload => message.reply(payload),
      invoker: message.author,
      sourceChannel: message.channel,
    });
  }

  async slashExecute({ interaction }) {
    const raw = interaction.options.getString("category", true);
    await interaction.deferReply({ ephemeral: true });
    return this.runDelete({
      guild: interaction.guild,
      raw,
      reply: payload => interaction.editReply(payload),
      invoker: interaction.user,
      sourceChannel: interaction.channel,
    });
  }

  async runDelete({ guild, raw, reply, invoker, sourceChannel }) {
    if (!guild) return reply({ content: "❌ This command can only be used inside a server." });

    const category = resolveCategory(guild, raw);
    if (category === "multiple") {
      return reply({
        embeds: [new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle("⚠️ Multiple categories have that name")
          .setDescription("Use the **category ID** instead so I delete the exact category you selected.")],
      });
    }
    if (!category) {
      return reply({
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("❌ Category not found")
          .setDescription("Use the exact category name or its ID.")],
      });
    }

    if (!category.deletable) {
      return reply({
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("❌ I cannot delete that category")
          .setDescription("I need **Manage Channels** and the category must be manageable by the bot.")],
      });
    }

    const children = [...category.children.cache.values()];
    const startedAt = Date.now();
    const targetName = category.name;
    const targetId = category.id;
    const outsideLogChannel = this.findOutsideLogChannel(guild, category, sourceChannel);

    const started = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle("🗑️ Category deletion started")
      .setDescription(
        `Deleting **${targetName}** and **${children.length}** channel(s).\n\n` +
        "⚡ Using a controlled deletion queue to stay fast while respecting Discord rate limits.\n" +
        "⏱️ Safety deadline: **3 minutes 30 seconds**.",
      )
      .addFields(
        { name: "Category", value: `**${targetName}**\n` + targetId, inline: true },
        { name: "Channels", value: String(children.length), inline: true },
        { name: "Started by", value: `<@${invoker.id}>`, inline: true },
      )
      .setTimestamp();

    await reply({ embeds: [started] });

    await LoggingManager.send(guild, "channel", {
      channelId: outsideLogChannel?.id,
      title: "Category deletion started",
      emoji: "🗑️",
      color: 0xFEE75C,
      description: `**${targetName}** is being deleted with all child channels.`,
      action: "CATEGORY_DELETE_START",
      target: `${targetName} (${targetId})`,
      executor: `<@${invoker.id}>`,
      fields: [{ name: "Channels queued", value: String(children.length), inline: true }],
    });

    let cursor = 0;
    let deleted = 0;
    let failed = [];

    const worker = async () => {
      while (true) {
        if (Date.now() - startedAt >= MAX_RUNTIME) return;
        const index = cursor++;
        if (index >= children.length) return;
        const channel = children[index];

        try {
          await withTimeout(channel.delete(`LightCore categorydelete by ${invoker.id}`), PER_CHANNEL_TIMEOUT);
          deleted++;
          db.guild.deleteTempVoiceChannel(channel.id);
        } catch {
          failed.push(channel);
        }
      }
    };

    await Promise.all(Array.from(
      { length: Math.min(DELETE_CONCURRENCY, Math.max(children.length, 1)) },
      () => worker(),
    ));

    // One short retry pass for channels that were rate-limited or temporarily failed.
    if (failed.length && Date.now() - startedAt < MAX_RUNTIME - 25000) {
      const retry = failed;
      failed = [];
      await sleep(1000);
      for (const channel of retry) {
        if (Date.now() - startedAt >= MAX_RUNTIME - 15000) {
          failed.push(channel);
          continue;
        }
        try {
          await withTimeout(channel.delete(`LightCore categorydelete retry by ${invoker.id}`), PER_CHANNEL_TIMEOUT);
          deleted++;
          db.guild.deleteTempVoiceChannel(channel.id);
        } catch {
          failed.push(channel);
        }
      }
    }

    let categoryDeleted = false;
    if (!failed.length && Date.now() - startedAt < MAX_RUNTIME) {
      try {
        await withTimeout(category.delete(`LightCore categorydelete by ${invoker.id}`), PER_CHANNEL_TIMEOUT);
        categoryDeleted = true;
      } catch {}
    }

    if (categoryDeleted) this.cleanupDeletedReferences(guild, targetId, children.map(ch => ch.id));

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const remaining = failed.length;
    const complete = categoryDeleted && remaining === 0;

    const finished = new EmbedBuilder()
      .setColor(complete ? 0x57F287 : 0xED4245)
      .setTitle(complete ? "✅ Category deleted" : "⚠️ Category deletion incomplete")
      .setDescription(
        complete
          ? `**${targetName}** and all **${deleted}** child channel(s) were deleted successfully.`
          : `I could not safely finish deleting **${targetName}**. **${deleted}** channel(s) were deleted and **${remaining}** channel(s) could not be removed within the safety window.`,
      )
      .addFields(
        { name: "Channels deleted", value: String(deleted), inline: true },
        { name: "Failed / remaining", value: String(remaining), inline: true },
        { name: "Time", value: `${elapsed}s`, inline: true },
      )
      .setTimestamp();

    // If the command was issued from the category being deleted, Discord will remove
    // the command channel too, so the final message may disappear naturally.
    await reply({ embeds: [finished] }).catch(() => null);

    await LoggingManager.send(guild, "channel", {
      channelId: outsideLogChannel?.id,
      title: complete ? "Category deleted" : "Category deletion incomplete",
      emoji: complete ? "✅" : "⚠️",
      color: complete ? 0x57F287 : 0xED4245,
      description: complete
        ? `Category **${targetName}** and all child channels were deleted.`
        : `Category **${targetName}** could not be fully removed before the safety deadline.`,
      action: complete ? "CATEGORY_DELETE" : "CATEGORY_DELETE_INCOMPLETE",
      target: `${targetName} (${targetId})`,
      executor: `<@${invoker.id}>`,
      fields: [
        { name: "Deleted", value: String(deleted), inline: true },
        { name: "Remaining", value: String(remaining), inline: true },
        { name: "Duration", value: `${elapsed}s`, inline: true },
      ],
    });

    return finished;
  }

  cleanupDeletedReferences(guild, categoryId, deletedChannelIds) {
    try {
      const removed = new Set([categoryId, ...deletedChannelIds]);
      const cfg = db.guild.getLogging(guild.id);
      if (cfg.enabled) {
        const channels = Object.fromEntries(
          Object.entries(cfg.channels || {}).filter(([, id]) => !removed.has(id)),
        );
        const enabled = Object.keys(channels).length > 0;
        db.guild.setLogging(guild.id, channels, enabled);
      }

      const tv = db.guild.getTempVoiceSettings(guild.id);
      const next = {};
      if (removed.has(tv.joinChannel)) next.joinChannel = null;
      if (removed.has(tv.category)) next.category = null;
      if (Object.keys(next).length) db.guild.setTempVoiceSettings(guild.id, next);
    } catch {}
  }

  findOutsideLogChannel(guild, category, sourceChannel) {
    const configured = db.guild.getLogging(guild.id);
    const candidates = Object.values(configured.channels || {})
      .map(id => guild.channels.cache.get(id))
      .filter(ch => ch?.isTextBased?.() && ch.parentId !== category.id && ch.id !== category.id);

    if (candidates[0]) return candidates[0];

    if (sourceChannel?.isTextBased?.() && sourceChannel.parentId !== category.id) return sourceChannel;
    return null;
  }
}

export default new CategoryDelete();
