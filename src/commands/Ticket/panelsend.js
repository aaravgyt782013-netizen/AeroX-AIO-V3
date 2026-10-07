import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { buildTicketEmbed } from "#utils/TicketEmbed";

function buttonStyle(name) {
  return { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger }[name] || ButtonStyle.Primary;
}
function renderComponents(panel) {
  const rows = [];
  const cats = panel.categories || [];
  if (panel.useDropdown) {
    const pages = [];
    for (let i = 0; i < cats.length; i += 25) pages.push(cats.slice(i, i + 25));
    const page = pages[0] || [];
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId("ticket_create_" + panel.panel_id + "_page_0")
      .setPlaceholder(panel.panelStyle?.placeholder || "Select a ticket category")
      .addOptions(page.map((cat, i) => ({
        label: cat.name.slice(0, 100),
        description: (cat.description || "Create a ticket").slice(0, 100),
        value: String(i),
        emoji: cat.emoji || undefined
      })))));
    if (pages.length > 1) rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_page_" + panel.panel_id + "_1").setLabel("Next").setStyle(ButtonStyle.Secondary)
    ));
    return rows;
  }
  for (let i = 0; i < cats.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(cats.slice(i, i + 5).map((cat, j) => {
      const b = new ButtonBuilder().setCustomId("ticket_create_" + panel.panel_id + "_" + (i + j))
        .setLabel(cat.name.slice(0, 80)).setStyle(buttonStyle(panel.panelStyle?.buttonStyle));
      if (cat.emoji) b.setEmoji(cat.emoji);
      return b;
    })));
    if (rows.length >= 5) break;
  }
  const pages = Math.ceil(cats.length / 25);
  if (pages > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_page_" + panel.panel_id + "_0").setLabel("Next").setStyle(ButtonStyle.Secondary)
  ));
  return rows.slice(0, 5);
}

export default {
  name: "panelsend",
  description: "Send an existing customizable ticket panel",
  usage: "panelsend <panel_id> [channel]",
  aliases: ["sendpanel", "resendpanel"],
  category: "Ticket",
  cooldown: 5,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({ embeds: [buildTicketEmbed({ title: emoji.get("cross") + " No Permission", description: "You need Manage Server.", color: 0xED4245 })] });
    }
    const panelId = Number(args[0]);
    if (!Number.isInteger(panelId)) {
      return message.reply({ embeds: [buildTicketEmbed({ title: emoji.get("cross") + " Invalid Panel ID", description: "Usage: panelsend <panel_id> [channel]", color: 0xED4245 })] });
    }
    const panel = db.getTicketPanel(message.guild.id, panelId);
    if (!panel) return message.reply({ embeds: [buildTicketEmbed({ title: emoji.get("cross") + " Panel Not Found", description: "That panel does not exist.", color: 0xED4245 })] });

    const target = args[1] ? message.guild.channels.cache.get(message.mentions.channels.first()?.id || args[1].replace(/[<#>]/g, "")) : message.channel;
    if (!target?.isTextBased()) return message.reply({ embeds: [buildTicketEmbed({ title: emoji.get("cross") + " Invalid Channel", description: "Choose a text channel.", color: 0xED4245 })] });

    const style = panel.panelStyle || { title: panel.panelTitle, description: panel.panelDescription, color: panel.panelColor };
    const sent = await target.send({ embeds: [buildTicketEmbed(style, { server: message.guild.name })], components: renderComponents(panel) });
    db.updateTicketPanel(message.guild.id, panelId, { panel_channel_id: target.id, panel_message_id: sent.id });
    return message.reply({ embeds: [buildTicketEmbed({ title: emoji.get("check") + " Panel Sent", description: "Panel #" + panelId + " was published in " + target + ".", color: 0x57F287, timestamp: true })] });
  }
};
