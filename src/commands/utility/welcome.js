import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { automationPlaceholderHelp, renderAutomationMessage } from "#utils/AutomationUtils";

const DEFAULT_MESSAGE = "Welcome {user} to **{server}**! You are member **#{membercount}**.";

function replyBox(content) {
  const embed = new EmbedBuilder()
    .setTitle("👋 Welcome Setup")
    .setDescription(content)
    .setColor(0x5865F2)
    .setTimestamp();
  return { embeds: [embed] };
}

function resolveChannel(message, raw) {
  const mentioned = message.mentions.channels.first();
  if (mentioned) return mentioned;
  const id = String(raw || "").match(/^\d{17,20}$/)?.[0];
  return id ? message.guild.channels.cache.get(id) || null : null;
}

function welcomePanel(channelId, message, style = "embed") {
  const container = new ContainerBuilder().setAccentColor(0x5865F2);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji.get("tada","👋")} LIGHTCORE • WELCOME SETUP`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    "**Channel:** <#" + channelId + ">\n**Style:** " +
    (style === "direct" ? emoji.get("reply","💬") + " Direct Message" : emoji.get("embed","🖼️") + " Embed") +
    "\n\n**Message:**\n" + message
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lc_welcome_direct").setLabel("Direct Message").setEmoji(emoji.get("reply","💬")).setStyle(style === "direct" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lc_welcome_embed").setLabel("Embed").setEmoji(emoji.get("embed","🖼️")).setStyle(style === "embed" ? ButtonStyle.Success : ButtonStyle.Secondary)
  ));
  return container;
}

async function sendWelcomeSetup(message, userId) {
  const current = db.getWelcome(message.guild.id);
  const sent = await message.reply({
    components: [welcomePanel(current.channel_id, current.message, current.welcome_style || "embed")],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true
  });
  const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
  collector.on("collect", async interaction => {
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: "Only the person who opened this setup panel can use it.", ephemeral: true });
    }
    const style = interaction.customId === "lc_welcome_direct" ? "direct" :
      interaction.customId === "lc_welcome_embed" ? "embed" : null;
    if (!style) return;
    try {
      db.setWelcomeStyle(message.guild.id, style);
      const updated = db.getWelcome(message.guild.id);
      await interaction.update({
        components: [welcomePanel(updated.channel_id, updated.message, updated.welcome_style)],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      await interaction.reply({ content: "Could not update welcome style: " + (error?.message || "unknown error"), ephemeral: true }).catch(() => {});
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
      if (!channel) return message.reply(replyBox(emoji.get("cross") + " Mention a text channel or provide its ID."));
      db.setWelcome(guildId, channel.id, text, "embed");
      return sendWelcomeSetup(message, message.author.id);
    }

    if (sub === "message") {
      const text = args.slice(1).join(" ");
      const current = db.getWelcome(guildId);
      if (!text) return message.reply(replyBox(emoji.get("cross") + " Provide a welcome message."));
      if (!current) return message.reply(replyBox(emoji.get("cross") + " Run .welcome setup #channel message first."));
      db.setWelcome(guildId, current.channel_id, text, current.welcome_style || "embed");
      const dm = db.getWelcomeDM(guildId);\n    return message.reply(replyBox(\n      "**Welcome Systems**\n\n**Server Channel:** <#" + current.channel_id + "> — " + (current.enabled ? "ON" : "OFF") +\n      "\n**Channel Message:**\n" + current.message +\n      "\n\n**DM Welcome:** " + (dm?.enabled ? "ON" : "OFF") +\n      "\n**DM Message:**\n" + (dm?.message || "Not configured") +\n      "\n\nBoth systems can be enabled at the same time. Use .welcome dm setup <message> to configure the DM system."\n    ));\n  }\n  async slashExecute({ interaction }) {
    const channel = interaction.options.getChannel("channel");
    const text = interaction.options.getString("message");
    db.setWelcome(interaction.guild.id, channel.id, text, "embed");
    const current = db.getWelcome(interaction.guild.id);
    const sent = await interaction.reply({ components: [welcomePanel(current.channel_id, current.message, current.welcome_style)], flags: MessageFlags.IsComponentsV2, fetchReply: true });
    const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on("collect", async component => {
      if (component.user.id !== interaction.user.id) return component.reply({ content: "Only the setup owner can use this panel.", ephemeral: true });
      const style = component.customId === "lc_welcome_direct" ? "direct" : component.customId === "lc_welcome_embed" ? "embed" : null;
      if (!style) return;
      db.setWelcomeStyle(interaction.guild.id, style);
      const updated = db.getWelcome(interaction.guild.id);
      await component.update({ components: [welcomePanel(updated.channel_id, updated.message, updated.welcome_style)], flags: MessageFlags.IsComponentsV2 });
    });
  }
}

export default new WelcomeCommand();
