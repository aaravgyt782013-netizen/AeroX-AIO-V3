import {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { logger } from "#utils/logger";
import { db } from "#database/DatabaseManager";
import { antiAbuse } from "#utils/AntiAbuse";
import emoji from "#config/emoji";
import {
  canUseCommand,
  getMissingBotPermissions,
  inSameVoiceChannel,
} from "#utils/permissionUtil";
import { config } from "#config/config";
import { PlayerManager } from "#managers/PlayerManager";
import { leveling } from "#managers/LevelingManager";

async function _sendError(message, title, description) {
  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL(config.links.supportServer)
    .setStyle(ButtonStyle.Link);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **${title}**`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(description),
        )
        .setButtonAccessory(button),
    );

  const reply = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    ephemeral: true,
  };

  try {
    if (message.replied || message.deferred) {
      await message.followUp(reply);
    } else {
      await message.reply(reply);
    }
  } catch (e) {}
}

async function _sendPremiumError(message, type) {
  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL(config.links.supportServer)
    .setStyle(ButtonStyle.Link);

  const typeText = type === "user" ? "User Premium" : "Guild Premium";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("info")} **${typeText} Required**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "This command is an exclusive feature for our premium subscribers.",
          ),
        )
        .setButtonAccessory(button),
    );

  await message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    ephemeral: true,
  });
}

async function _sendCooldownError(message, cooldownTime, command) {
  if (
    !antiAbuse.shouldShowCooldownNotification(message.author.id, command.name)
  ) {
    return;
  }

  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL(config.links.supportServer)
    .setStyle(ButtonStyle.Link);

  const hasPremium = db.hasAnyPremium(message.author.id, message.guild.id);
  const premiumText = hasPremium
    ? ""
    : "\n\nPremium users get 50% faster cooldowns";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("cross")} **Cooldown Active**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Please wait **${cooldownTime}** more second(s) before using this command again.${premiumText}`,
          ),
        )
        .setButtonAccessory(button),
    );

  try {
    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  } catch (e) {}
}

async function _handleExpiredUserPerks(userId, author) {
  const hasNoPrefix = db.hasNoPrefix(userId);
  const userPrefixes = db.getUserPrefixes(userId);
  if (!hasNoPrefix && userPrefixes.length === 0) return;

  if (!db.isUserPremium(userId)) {
    let perksRemoved = [];
    if (hasNoPrefix) {
      db.setNoPrefix(userId, false, null);
      perksRemoved.push("No-Prefix Mode");
    }
    if (userPrefixes.length > 0) {
      db.setUserPrefixes(userId, []);
      perksRemoved.push("Custom User Prefixes");
    }

    if (perksRemoved.length > 0 && Math.random() < 0.3) {
      const button = new ButtonBuilder()
        .setLabel("Support")
        .setURL(config.links.supportServer)
        .setStyle(ButtonStyle.Link);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("info")} **User Premium Expired**`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        )
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "Your subscription has ended. The following perks have been disabled:\n• " +
                  perksRemoved.join("\n• "),
              ),
            )
            .setButtonAccessory(button),
        );

      try {
        await author.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}
    }
  }
}

async function _handleExpiredGuildPerks(guildId, channel) {
  if (db.isGuildPremium(guildId)) return;
  const prefixes = db.getPrefixes(guildId);
  if (prefixes.length > 1) {
    db.setPrefixes(guildId, [config.prefix]);

    const button = new ButtonBuilder()
      .setLabel("Support")
      .setURL(config.links.supportServer)
      .setStyle(ButtonStyle.Link);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Server Premium Expired**`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `This server's premium has expired. Multiple prefixes have been disabled, and the prefix has been reset to: \`${config.prefix}\``,
            ),
          )
          .setButtonAccessory(button),
      );

    try {
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}
  }
}

function _parseCommand(message, client) {
  const content = message.content.trim();
  const mentionPrefixRegex = new RegExp(`^<@!?${client.user.id}>\\s+`);
  const mentionMatch = content.match(mentionPrefixRegex);

  let commandText = null;

  if (mentionMatch) {
    commandText = content.slice(mentionMatch[0].length).trim();
  } else {
    // Custom personal prefixes are also a User Premium perk.
    if (db.isUserPremium(message.author.id)) {
      const userPrefix = db
        .getUserPrefixes(message.author.id)
        .find((p) => p && content.startsWith(p));
      if (userPrefix) commandText = content.slice(userPrefix.length).trim();
    }

    if (commandText === null) {
      const guildPrefix = db
        .getPrefixes(message.guild.id)
        .find((p) => p && content.startsWith(p));
      if (guildPrefix) commandText = content.slice(guildPrefix.length).trim();
    }

    // Any registered prefix command or alias can be invoked without a prefix
    // by active User Premium subscribers. Command discovery is dynamic, so new
    // commands are supported automatically without maintaining a manual list.
    if (commandText === null && Boolean(db.isUserPremium(message.author.id))) {
      commandText = content;
    }

    if (commandText === null && /^yuki/i.test(content)) {
      commandText = content.slice(4).trim();
    }
  }

  if (commandText === null) return null;

  const parts = commandText.split(/\\s+/).filter(Boolean);
  if (!parts.length) return null;

  const normalized = parts.map((part) => part.toLowerCase());
  const commands = client.commandHandler.commands;
  const aliases = client.commandHandler.aliases;

  // Normalize all registered names and aliases once per message. Match the
  // longest full command/alias name, regardless of how many words it contains.
  const commandNames = new Map();
  for (const [name, command] of commands) {
    if (name) commandNames.set(String(name).toLowerCase(), command.name);
    for (const alias of command.aliases || []) {
      if (alias) commandNames.set(String(alias).toLowerCase(), command.name);
    }
  }
  // Include aliases registered by the handler even if a command's own alias
  // list is not normalized identically.
  for (const [alias, target] of aliases) {
    if (alias && target) commandNames.set(String(alias).toLowerCase(), target);
  }

  for (let length = normalized.length; length >= 1; length--) {
    const candidate = normalized.slice(0, length).join(" ");
    const canonicalName = commandNames.get(candidate);
    if (canonicalName) {
      return {
        commandName: String(canonicalName).toLowerCase(),
        args: parts.slice(length),
      };
    }
  }

  return null;
}

export default {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    await _handleExpiredGuildPerks(message.guild.id, message.channel);
    await _handleExpiredUserPerks(message.author.id, message.author);

    const userBlacklist = db.isUserBlacklisted(message.author.id);
    if (userBlacklist) {
      const premium = db.isUserPremium(message.author.id);
      const automatedCooldownBlacklist =
        typeof userBlacklist === "object" &&
        /Automated: Excessive cooldown violations \(Anti-abuse system\)/i.test(
          userBlacklist.reason || "",
        );

      // Recover Premium users that were locked out by the old cooldown
      // anti-abuse behavior. Manual blacklists are never bypassed.
      if (premium && automatedCooldownBlacklist) {
        db.unblacklistUser(message.author.id);
      } else {
        return;
      }
    }

    if (db.isGuildBlacklisted(message.guild.id)) return;

    // Award XP for ordinary server messages and announce level-ups.
    if (message.content.trim()) {
      try {
        const result = leveling.awardMessageXp(message.guild.id, message.author.id);
        if (result.leveledUp) {
          const settings = result.settings || leveling.getSettings(message.guild.id);
          const channel = settings.announcement_channel_id
            ? await message.guild.channels.fetch(settings.announcement_channel_id).catch(() => null)
            : message.channel;
          if (channel?.isTextBased?.()) {
            const isGuildPremium = Boolean(db.isGuildPremium(message.guild.id));
            const template = isGuildPremium && settings.announcement_text
              ? settings.announcement_text
              : "🎉 {user} reached **Level {level}**! Keep chatting to earn more XP.";
            const content = template
              .replaceAll("{user}", `<@${message.author.id}>`)
              .replaceAll("{username}", message.author.username)
              .replaceAll("{level}", String(result.level))
              .replaceAll("{xp}", Number(result.xp).toLocaleString("en-US"))
              .replaceAll("{server}", message.guild.name);
            await channel.send({
              content,
              allowedMentions: { users: [message.author.id], roles: [], parse: [] },
            }).catch((error) => logger.warn("Leveling", "Could not send level-up announcement", error));
          }
        }
      } catch (error) {
        logger.error("Leveling", "Could not award message XP", error);
      }
    }

    const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*$`);
    if (mentionRegex.test(message.content.trim())) {
      if (!antiAbuse.canShowMentionResponse(message.author.id)) {
        return;
      }

      const guildPrefixes = db.getPrefixes(message.guild.id);
      const currentPrefix = guildPrefixes[0] || config.prefix;
      const guildIconUrl = message.guild.iconURL({ dynamic: true, size: 256 });

      const homeContent = `> *Hey <@${message.author.id}>, I'm* __**LightCore**__ ${emoji.get("status")}\n` +
        `> *A **multipurpose** bot made to manage your server safely and smoothly with **moderation, music, ticket and more...** ${emoji.get("info")}*\n\n` +
        `*Type \`${currentPrefix}help\` to know more about my commands and more...*\n\n` +
        `**Server Prefix:** \`${currentPrefix}\``;

      const container = new ContainerBuilder();
      
      if (guildIconUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(homeContent)
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(guildIconUrl)
            )
        );
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(homeContent)
        );
      }

      const systemButton = new ButtonBuilder()
        .setCustomId("mention_system")
        .setLabel("System")
        .setStyle(ButtonStyle.Secondary);

      const devsButton = new ButtonBuilder()
        .setCustomId("mention_devs")
        .setLabel("About Devs")
        .setStyle(ButtonStyle.Secondary);

      const linksButton = new ButtonBuilder()
        .setCustomId("mention_links")
        .setLabel("Links")
        .setStyle(ButtonStyle.Secondary);

      const homeButton = new ButtonBuilder()
        .setCustomId("mention_home")
        .setEmoji("🏠")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(
        systemButton,
        devsButton,
        linksButton,
        homeButton
      );

      return message.reply({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const commandInfo = _parseCommand(message, client);
    if (!commandInfo) return;

    const { commandName, args } = commandInfo;
    let command = client.commandHandler.commands.get(commandName);
    if (!command) {
      const aliasTarget = client.commandHandler.aliases.get(commandName);
      if (aliasTarget) {
        command = client.commandHandler.commands.get(aliasTarget);
      }
    }
    if (!command) return;

    try {
      const cooldownTime = antiAbuse.checkCooldown(message.author.id, command,message);
      if (cooldownTime) {
        return _sendCooldownError(message, cooldownTime, command);
      }

      if (
        command.maintenance &&
        !config.ownerIds?.includes(message.author.id)
      ) {
        return _sendError(
          message,
          "Command Under Maintenance",
          "This command is temporarily unavailable. Please try again later.",
        );
      }

      if (command.ownerOnly && !config.ownerIds?.includes(message.author.id)) {
        return;
      }

      if (!canUseCommand(message.member, command)) {
        return _sendError(
          message,
          "Insufficient Permissions",
          `You do not have the required permissions to use this command, you need: \`${new PermissionsBitField(
            command.userPermissions,
          )
            .toArray()
            .join(", ")}\``,
        );
      }

      if (command.permissions?.length > 0) {
        const missingBotPerms = getMissingBotPermissions(
          message.channel,
          command.permissions,
        );
        if (missingBotPerms.length > 0) {
          return _sendError(
            message,
            "Missing Bot Permissions",
            `I need the following permissions to run this command: \`${missingBotPerms.join(
              ", ",
            )}\``,
          );
        }
      }

const djSettings = db.guild.getMusicSettings(message.guild.id);
      if (command.category?.toLowerCase() === "music" && command.name !== "settings" && djSettings.djRole && !config.ownerIds?.includes(message.author.id) && !message.member.permissions.has(PermissionFlagsBits.Administrator) && !message.member.roles.cache.has(djSettings.djRole)) {
        return _sendError(message, "DJ Role Required", `This server has a DJ role configured: <@&${djSettings.djRole}>. You need that role to control music.`);
      }

            if (command.userPrem && !db.isUserPremium(message.author.id))
        return _sendPremiumError(message, "user");
      if (command.guildPrem && !db.isGuildPremium(message.guild.id))
        return _sendPremiumError(message, "guild");
      if (
        command.anyPrem &&
        !db.hasAnyPremium(message.author.id, message.guild.id)
      )
        return _sendPremiumError(message, "user");

      if (command.voiceRequired && !message.member.voice.channel) {
        return _sendError(
          message,
          "Voice Channel Required",
          "You must be in a voice channel to use this command.",
        );
      }
      if (command.sameVoiceRequired && message.guild.members.me.voice.channel) {
        if (!inSameVoiceChannel(message.member, message.guild.members.me)) {
          return _sendError(
            message,
            "Same Voice Channel Required",
            "You must be in the same voice channel as me to use this command.",
          );
        }
      }

      const player = client.music.getPlayer(message.guild.id);
      if (command.playerRequired && !player) {
        return _sendError(
          message,
          "No Player Active",
          "There is no music player in this server. Use `/play` to start one.",
        );
      }
      if (command.playingRequired && (!player || !player.queue.current)) {
        return _sendError(
          message,
          "Nothing Is Playing",
          "There is no track currently playing.",
        );
      }

      const guildPrefixes = db.getPrefixes(message.guild.id);
      const prefix = guildPrefixes[0] || config.prefix;
      
      const executionContext = { client, message, args, prefix };
      if (command.playerRequired || command.playingRequired) {
        executionContext.pm = new PlayerManager(player);
      }

      antiAbuse.setCooldown(message.author.id, command);
      await command.execute(executionContext);
    } catch (error) {
      logger.error(
        "MessageCreate",
        `Error executing command '${command.name}' for user ${message.author.id}`,
        error,
      );
      await _sendError(
        message,
        "An Unexpected Error Occurred",
        `Something went wrong while trying to run the \`${command.name}\` command. Please try again later.`,
      );
    }
  },
};