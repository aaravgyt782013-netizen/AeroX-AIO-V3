import { Command } from "#structures/classes/Command";
import {
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { automationPlaceholderHelp, renderAutomationMessage } from "#utils/AutomationUtils";

const DEFAULT_MESSAGE = "Welcome {user} to **{server}**! You are member **#{membercount}**.";

function replyBox(content) {
  const panel = new ContainerBuilder().setAccentColor(0x5865F2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## 👋 LIGHTCORE • WELCOME SETUP\n\n" + String(content || "").slice(0, 3500)))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# ✨ LightCore • Server tools"));
  return { components: [panel], flags: MessageFlags.IsComponentsV2 };
}

function resolveChannel(message, raw) {
  const mentioned = message.mentions.channels.first();
  if (mentioned) return mentioned;
  const id = String(raw || "").match(/^\d{17,20}$/)?.[0];
  return id ? message.guild.channels.cache.get(id) || null : null;
}

function welcomePanel(current) {
  const channel = current?.channel_id ? "<#" + current.channel_id + ">" : "Not configured";
  const style = current?.welcome_style === "direct" ? "💬 Direct Message" : "🖼️ Embed";
  const container = new ContainerBuilder().setAccentColor(0x5865F2);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent("## 👋 LIGHTCORE • WELCOME SETUP"));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    "**Server Channel:** " + channel +
    "\n**Channel Welcome:** " + (current?.enabled ? "ON" : "OFF") +
    "\n**Style:** " + style +
    "\n\n**Message:**\n" + (current?.message || "Not configured") +
    "\n\n**DM Welcome:** " + (current?.dm_enabled ? "ON" : "OFF") +
    "\n**DM Message:**\n" + (current?.dm_message || "Not configured")
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lc_welcome_direct").setLabel("Text Message").setStyle(current?.welcome_style === "direct" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lc_welcome_embed").setLabel("Embed Card").setStyle(current?.welcome_style === "embed" || !current?.welcome_style ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lc_welcome_test").setLabel("Send Preview").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("lc_welcome_toggle").setLabel(current?.enabled ? "Disable Public" : "Enable Public").setStyle(current?.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
  ));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lc_welcome_dm_test").setLabel("Preview DM").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lc_welcome_dm_toggle").setLabel(current?.dm_enabled ? "Disable DM" : "Enable DM").setStyle(current?.dm_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("lc_welcome_refresh").setLabel("Refresh Panel").setStyle(ButtonStyle.Secondary)
  ));
  return container;
}

async function sendWelcomeSetup(message, userId) {
  const sent = await message.reply({
    components: [welcomePanel(db.getWelcome(message.guild.id))],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });
  const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: "Only the person who opened this setup panel can use it.", ephemeral: true }).catch(() => {});
    }
    try {
      const guild = message.guild;
      const current = db.getWelcome(guild.id);
      const style = interaction.customId === "lc_welcome_direct" ? "direct" : interaction.customId === "lc_welcome_embed" ? "embed" : null;
      if (style) {
        db.setWelcomeStyle(guild.id, style);
      } else if (interaction.customId === "lc_welcome_toggle" || interaction.customId === "lc_welcome_off") {
        if (current?.enabled) db.disableWelcome(guild.id);
        else if (current?.channel_id) db.setWelcome(guild.id, current.channel_id, current.message || DEFAULT_MESSAGE, current.welcome_style || "embed");
        else return interaction.reply({ content: "Run .welcome setup #channel <message> first.", ephemeral: true }).catch(() => {});
      } else if (interaction.customId === "lc_welcome_dm_toggle") {
        const dm = db.getWelcomeDM(guild.id);
        if (dm?.enabled) db.disableWelcomeDM(guild.id);
        else {
          if (!dm?.message) db.setWelcomeDM(guild.id, DEFAULT_MESSAGE);
          db.setWelcomeDMEnabled(guild.id, true);
        }
      } else if (interaction.customId === "lc_welcome_test") {
        const fresh = db.getWelcome(guild.id);
        const channel = fresh?.channel_id ? guild.channels.cache.get(fresh.channel_id) : null;
        if (!fresh?.enabled || !channel?.isTextBased()) {
          return interaction.reply({ content: "Public welcome is disabled or its channel is unavailable.", ephemeral: true }).catch(() => {});
        }
        const preview = renderAutomationMessage(fresh.message || DEFAULT_MESSAGE, { member: message.member, guild, channel });
        if (fresh.welcome_style === "direct") await channel.send({ content: preview, allowedMentions: { parse: ["users", "roles"] } });
        else await channel.send({ embeds: [{ color: 0x5865F2, title: "👋 Welcome to " + guild.name, description: String(preview || "").slice(0, 4000), thumbnail: { url: message.author.displayAvatarURL({ size: 256 }) }, footer: { text: "LightCore • Welcome Preview" }, timestamp: new Date().toISOString() }], allowedMentions: { parse: ["users", "roles"] } });
        return interaction.reply({ content: "Welcome preview sent to " + channel + ".", ephemeral: true }).catch(() => {});
      } else if (interaction.customId === "lc_welcome_dm_test") {
        const dm = db.getWelcomeDM(guild.id);
        if (!dm?.message) return interaction.reply({ content: "Configure a DM message with .welcome dm setup <message> first.", ephemeral: true }).catch(() => {});
        const preview = renderAutomationMessage(dm.message, { member: message.member, guild });
        await message.author.send({ content: preview }).catch(() => { throw new Error("I couldn't DM you. Check your Discord privacy settings."); });
        return interaction.reply({ content: "DM preview sent.", ephemeral: true }).catch(() => {});
      } else if (interaction.customId !== "lc_welcome_refresh") {
        return interaction.deferUpdate().catch(() => {});
      }
      return interaction.update({ components: [welcomePanel(db.getWelcome(guild.id))], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      const reply = { content: "Could not update welcome settings: " + (error?.message || "unknown error"), ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  });
  return sent;
}

class WelcomeCommand extends Command {
  constructor() {
    super({
      name: "welcome",
      description: "Configure automatic member welcome messages",
      usage: "welcome <setup|message|channel|style|dm|view|test|off|placeholders>",
      examples: [
        "welcome setup #welcome Welcome {user} to {server}! You are member #{membercount}.",
        "welcome message Welcome {user}! Read {ruleschannel}.",
        "welcome style embed",
        "welcome dm setup Welcome to {server}, {user}!",
        "welcome test",
        "welcome placeholders",
      ],
      aliases: ["welcomer", "greet", "greeting"],
      category: "Utility",
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.SendMessages],
      enabledSlash: true,
      slashData: {
        name: ["welcome", "setup"],
        groupDescription: "Configure automatic welcome messages.",
        description: "Set the welcome channel and message.",
        options: [
          { name: "channel", description: "Channel where welcomes are sent.", type: 7, required: true, channel_types: [0, 5] },
          { name: "message", description: "Welcome message with placeholders.", type: 3, required: true },
        ],
      },
    });
  }

  async execute({ message, args }) {
    const sub = (args[0] || "view").toLowerCase();
    const guildId = message.guild.id;

    if (sub === "setup") {
      const channel = resolveChannel(message, args[1]);
      const text = args.slice(2).join(" ") || DEFAULT_MESSAGE;
      if (text !== DEFAULT_MESSAGE && !db.isGuildPremium(guildId)) return message.reply(replyBox(emoji.get("info") + " Custom welcome messages require **Guild Premium**. Use the default message or upgrade this server."));
      if (!channel) return message.reply(replyBox(emoji.get("cross") + " Mention a text channel or provide its ID."));
      db.setWelcome(guildId, channel.id, text, "embed");
      return sendWelcomeSetup(message, message.author.id);
    }

    if (sub === "message") {
      const text = args.slice(1).join(" ");
      const current = db.getWelcome(guildId);
      if (!text) return message.reply(replyBox(emoji.get("cross") + " Provide a welcome message."));
      if (!db.isGuildPremium(guildId)) return message.reply(replyBox(emoji.get("info") + " Custom welcome messages require **Guild Premium**."));
      if (!current?.channel_id) return message.reply(replyBox(emoji.get("cross") + " Run .welcome setup #channel message first."));
      db.setWelcome(guildId, current.channel_id, text, current.welcome_style || "embed");
      return message.reply(replyBox(emoji.get("check") + " Welcome message updated."));
    }

    if (sub === "channel") {
      const channel = resolveChannel(message, args[1]);
      const current = db.getWelcome(guildId);
      if (!channel || !current) return message.reply(replyBox(emoji.get("cross") + " Run .welcome setup #channel message first."));
      db.setWelcome(guildId, channel.id, current.message, current.welcome_style || "embed");
      return message.reply(replyBox(emoji.get("check") + " Welcome channel changed to <#" + channel.id + ">."));
    }

    if (sub === "style") {
      const style = (args[1] || "").toLowerCase();
      if (!["embed", "direct"].includes(style)) return message.reply(replyBox(emoji.get("cross") + " Use .welcome style embed or .welcome style direct."));
      if (!db.getWelcome(guildId)) return message.reply(replyBox(emoji.get("cross") + " Run .welcome setup first."));
      db.setWelcomeStyle(guildId, style);
      return message.reply(replyBox(emoji.get("check") + " Welcome style set to **" + style + "**."));
    }

    if (sub === "dm") {
      const action = (args[1] || "view").toLowerCase();

      if (action === "setup" || action === "message") {
        const text = args.slice(2).join(" ");
        if (!text) return message.reply(replyBox(emoji.get("cross") + " Use .welcome dm setup Welcome {user}!"));
        db.setWelcomeDM(guildId, text);
        return message.reply(replyBox(emoji.get("check") + " DM welcome enabled.\n\n**Message:**\n" + text));
      }

      if (action === "on" || action === "enable") {
        const current = db.getWelcome(guildId);
        if (!current) db.setWelcomeDM(guildId, DEFAULT_MESSAGE);
        db.setWelcomeDMEnabled(guildId, true);
        return message.reply(replyBox(emoji.get("check") + " DM welcome is now **ON**."));
      }

      if (action === "off" || action === "disable") {
        db.disableWelcomeDM(guildId);
        return message.reply(replyBox(emoji.get("check") + " DM welcome is now **OFF**."));
      }

      if (action === "test") {
        const dm = db.getWelcomeDM(guildId);
        if (!dm?.message) return message.reply(replyBox(emoji.get("cross") + " Configure DM welcome first."));
        const rendered = renderAutomationMessage(dm.message, { member: message.member, guild: message.guild });
        await message.author.send({
          components: [new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(new TextDisplayBuilder().setContent("## 👋 LIGHTCORE • WELCOME DM PREVIEW\n\n" + String(rendered || "").slice(0, 3500)))], flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
        return message.reply(replyBox(emoji.get("check") + " DM preview sent to your DMs."));
      }

      const dm = db.getWelcomeDM(guildId);
      return message.reply(replyBox(
        "**DM Welcome:** " + (dm?.enabled ? "ON" : "OFF") +
        "\n**Message:**\n" + (dm?.message || "Not configured") +
        "\n\nUse .welcome dm setup <message>, .welcome dm on, .welcome dm off, or .welcome dm test."
      ));
    }

    if (sub === "test") {
      const current = db.getWelcome(guildId);
      if (!current?.enabled) return message.reply(replyBox(emoji.get("cross") + " Server welcome is not enabled."));
      const channel = message.guild.channels.cache.get(current.channel_id);
      if (!channel?.isTextBased()) return message.reply(replyBox(emoji.get("cross") + " The configured welcome channel no longer exists."));
      const rendered = renderAutomationMessage(current.message, { member: message.member, guild: message.guild, channel });
      if (current.welcome_style === "direct") {
        await channel.send({ content: rendered, allowedMentions: { parse: ["users", "roles"] } });
      } else {
        await channel.send({
          components: [new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(new TextDisplayBuilder().setContent("## 👋 LIGHTCORE • WELCOME PREVIEW\n\n" + String(rendered || "").slice(0, 3500)))], flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: ["users", "roles"] },
        });
      }
      return message.reply(replyBox(emoji.get("check") + " Welcome test sent."));
    }

    if (sub === "off" || sub === "disable") {
      db.disableWelcome(guildId);
      return message.reply(replyBox(emoji.get("check") + " Server welcome messages are now **OFF**."));
    }

    if (sub === "placeholders" || sub === "variables") {
      return message.reply(replyBox("**Welcome placeholders**\n\n" + automationPlaceholderHelp()));
    }

    const current = db.getWelcome(guildId);
    const dm = db.getWelcomeDM(guildId);
    return message.reply(replyBox(
      "**Server Welcome:** " + (current?.enabled ? "ON" : "OFF") +
      "\n**Channel:** " + (current?.channel_id ? "<#" + current.channel_id + ">" : "Not configured") +
      "\n**Style:** " + (current?.welcome_style || "embed") +
      "\n**Message:**\n" + (current?.message || "Not configured") +
      "\n\n**DM Welcome:** " + (dm?.enabled ? "ON" : "OFF") +
      "\n**DM Message:**\n" + (dm?.message || "Not configured") +
      "\n\nUse .welcome setup #channel <message>, .welcome dm setup <message>, .welcome test, or .welcome placeholders."
    ));
  }

  async slashExecute({ interaction }) {
    const channel = interaction.options.getChannel("channel");
    const text = interaction.options.getString("message");
    db.setWelcome(interaction.guild.id, channel.id, text, "embed");
    const current = db.getWelcome(interaction.guild.id);
    const sent = await interaction.reply({
      components: [welcomePanel(current)],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });
    const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on("collect", async (component) => {
      if (component.user.id !== interaction.user.id) return component.reply({ content: "Only the setup owner can use this panel.", ephemeral: true }).catch(() => {});
      try {
        const guild = interaction.guild;
        const current = db.getWelcome(guild.id);
        const style = component.customId === "lc_welcome_direct" ? "direct" : component.customId === "lc_welcome_embed" ? "embed" : null;
        if (style) db.setWelcomeStyle(guild.id, style);
        else if (component.customId === "lc_welcome_toggle" || component.customId === "lc_welcome_off") {
          if (current?.enabled) db.disableWelcome(guild.id);
          else if (current?.channel_id) db.setWelcome(guild.id, current.channel_id, current.message || DEFAULT_MESSAGE, current.welcome_style || "embed");
          else return component.reply({ content: "Configure a channel first.", ephemeral: true }).catch(() => {});
        } else if (component.customId === "lc_welcome_dm_toggle") {
          const dm = db.getWelcomeDM(guild.id);
          if (dm?.enabled) db.disableWelcomeDM(guild.id);
          else {
            if (!dm?.message) db.setWelcomeDM(guild.id, DEFAULT_MESSAGE);
            db.setWelcomeDMEnabled(guild.id, true);
          }
        } else if (component.customId === "lc_welcome_test") {
          const fresh = db.getWelcome(guild.id);
          const target = fresh?.channel_id ? guild.channels.cache.get(fresh.channel_id) : null;
          if (!fresh?.enabled || !target?.isTextBased()) return component.reply({ content: "Public welcome is disabled or its channel is unavailable.", ephemeral: true }).catch(() => {});
          const preview = renderAutomationMessage(fresh.message || DEFAULT_MESSAGE, { member: interaction.member, guild, channel: target });
          if (fresh.welcome_style === "direct") await target.send({ content: preview, allowedMentions: { parse: ["users", "roles"] } });
          else await target.send({ embeds: [{ color: 0x5865F2, title: "👋 Welcome to " + guild.name, description: String(preview || "").slice(0, 4000), thumbnail: { url: interaction.user.displayAvatarURL({ size: 256 }) }, footer: { text: "LightCore • Welcome Preview" }, timestamp: new Date().toISOString() }], allowedMentions: { parse: ["users", "roles"] } });
          return component.reply({ content: "Welcome preview sent to " + target + ".", ephemeral: true }).catch(() => {});
        } else if (component.customId === "lc_welcome_dm_test") {
          const dm = db.getWelcomeDM(guild.id);
          if (!dm?.message) return component.reply({ content: "Configure a DM message with .welcome dm setup <message> first.", ephemeral: true }).catch(() => {});
          const preview = renderAutomationMessage(dm.message, { member: interaction.member, guild });
          await interaction.user.send({ content: preview }).catch(() => { throw new Error("I couldn't DM you. Check your Discord privacy settings."); });
          return component.reply({ content: "DM preview sent.", ephemeral: true }).catch(() => {});
        } else if (component.customId !== "lc_welcome_refresh") return component.deferUpdate().catch(() => {});
        return component.update({ components: [welcomePanel(db.getWelcome(guild.id))], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        const reply = { content: "Could not update welcome settings: " + (error?.message || "unknown error"), ephemeral: true };
        if (component.deferred || component.replied) await component.followUp(reply).catch(() => {});
        else await component.reply(reply).catch(() => {});
      }
    });
  }
}

export default new WelcomeCommand();
