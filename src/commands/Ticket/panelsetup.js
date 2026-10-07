import { PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { buildTicketEmbed } from "#utils/TicketEmbed";

const TIMEOUT = 300000;

export default {
  name: "panelsetup",
  description: "Create a fully customizable ticket panel with an interactive setup wizard",
  usage: "panelsetup",
  aliases: ["ticketpanel", "createpanel", "ticketsetup"],
  category: "Ticket",
  cooldown: 5,
  userPermissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message }) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({ embeds: [buildTicketEmbed({
        title: emoji.get("cross") + " No Permission",
        description: "You need Manage Server to configure ticket panels.",
        color: 0xED4245, timestamp: true
      })] });
    }

    const panelId = db.incrementPanelCounter(message.guild.id);
    const filter = m => m.author.id === message.author.id && m.channel.id === message.channel.id;

    const ask = async (title, description, parser = x => x.trim()) => {
      await message.channel.send({ embeds: [buildTicketEmbed({
        title: emoji.get("ticketPanel") + " " + title,
        description: description + "\n\nReply within 5 minutes. Type 'cancel' to stop.",
        color: 0x5865F2, timestamp: true
      })] });
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: TIMEOUT });
      const raw = collected.first()?.content?.trim();
      if (!raw) throw new Error("Setup timed out.");
      if (raw.toLowerCase() === "cancel") throw new Error("Setup cancelled.");
      return parser(raw);
    };

    const optional = async (title, description, fallback = "") =>
      ask(title, description + "\nReply 'skip' for default.", x => x.toLowerCase() === "skip" ? fallback : x);

    const channel = async (title, description, required = true, type = null) =>
      ask(title, description + (required ? "" : "\nReply 'skip' to leave empty."), x => {
        if (x.toLowerCase() === "skip" && !required) return null;
        const id = message.mentions.channels.first()?.id || x.replace(/[<#>]/g, "");
        const ch = message.guild.channels.cache.get(id);
        if (!ch || (type && ch.type !== type) || (!type && !ch.isTextBased())) throw new Error("Invalid channel. Restart setup and provide a valid channel.");
        return ch.id;
      });

    const role = async (title, description) =>
      ask(title, description, x => {
        if (x.toLowerCase() === "skip") return null;
        const id = message.mentions.roles.first()?.id || x.replace(/[<@&>]/g, "");
        if (!message.guild.roles.cache.has(id)) throw new Error("Invalid role.");
        return id;
      });

    try {
      const panelChannelId = await channel("1 • Panel Channel", "Where should the panel be published?");
      const title = (await optional("2 • Panel Title", "Enter the main panel title.", "Support Tickets")).slice(0, 256);
      const description = (await optional("3 • Panel Message", "Enter the panel description/message.", "Choose a category below to open a ticket.")).slice(0, 4096);
      const color = await optional("4 • Embed Color", "Enter a hex color such as #5865F2.", "#5865F2");
      const image = await optional("5 • Panel Image", "Enter an image URL.", "");
      const thumbnail = await optional("6 • Panel Thumbnail", "Enter a thumbnail URL.", "");
      const footer = await optional("7 • Footer Text", "Enter footer text.", "AeroX Ticket System");
      const footerIcon = await optional("8 • Footer Icon", "Enter a footer icon URL.", "");
      const authorName = await optional("9 • Author Name", "Enter an author name.", "");
      const authorIcon = await optional("10 • Author Icon", "Enter an author icon URL.", "");
      const url = await optional("11 • Embed URL", "Enter an optional clickable URL.", "");
      const timestamp = (await optional("12 • Timestamp", "Reply yes or no.", "yes")).toLowerCase() !== "no";
      const panelEmoji = await optional("13 • Panel Emoji", "Enter an emoji to prefix the title.", emoji.get("ticketPanel"));
      const selector = (await optional("14 • Category Selector", "Reply dropdown or buttons.", "dropdown")).toLowerCase() === "buttons" ? "buttons" : "dropdown";
      const placeholder = await optional("15 • Dropdown Placeholder", "Enter the select menu placeholder.", "Select a ticket category");
      const buttonStyleRaw = (await optional("16 • Button Style", "Reply primary, secondary, success, or danger.", "primary")).toLowerCase();
      const buttonStyle = ["primary", "secondary", "success", "danger"].includes(buttonStyleRaw) ? buttonStyleRaw : "primary";
      const autoTranscript = (await optional("17 • Automatic Transcripts", "Reply yes to automatically send HTML transcripts on close.", "yes")).toLowerCase() !== "no";
      const reviewChannelId = await channel("18 • Review Channel", "Where should ratings/reviews be posted?", false);

      const categories = [];
      while (true) {
        const n = categories.length + 1;
        const name = (await ask("Category " + n + " • Name", "Enter the category name.")).slice(0, 100);
        const catDescription = (await optional("Category " + n + " • Description", "Enter the category description.", "Create a " + name + " ticket.")).slice(0, 100);
        const catEmoji = await optional("Category " + n + " • Emoji", "Enter an emoji or skip.", "");
        const staffRoleId = await role("Category " + n + " • Staff Role", "Mention the staff role that should be pinged and granted access.");
        const ticketCategoryId = await channel("Category " + n + " • Discord Category", "Enter the Discord category where this ticket type will be created.", true, ChannelType.GuildCategory);
        const transcriptChannelId = await channel("Category " + n + " • Transcript Channel", "Enter the transcript channel for this category.", false);
        const welcomeTitle = (await optional("Category " + n + " • Welcome Title", "Enter the welcome embed title.", emoji.get("ticketOpen") + " Ticket Created")).slice(0, 256);
        const welcomeDescription = (await optional("Category " + n + " • Welcome Description", "Placeholders: {user}, {mention}, {username}, {server}, {category}, {ticketid}, {created}.", "Welcome {user}!\n\nPlease describe your issue and our team will help you shortly.")).slice(0, 4096);
        const welcomeImage = await optional("Category " + n + " • Welcome Image", "Enter a welcome image URL or skip.", "");
        categories.push({
          id: String(n), name, description: catDescription, emoji: catEmoji || null,
          staffRoleId, ticketCategoryId, transcriptChannelId,
          welcome: { title: welcomeTitle, description: welcomeDescription, image: welcomeImage || "" }
        });
        const more = await ask("Add Another Category?", "Reply yes to add another category or done to continue.", x => x.toLowerCase());
        if (more !== "yes") break;
      }

      const style = {
        title, description, color, image, thumbnail, footer, footerIcon,
        authorName, authorIcon, url, timestamp, panelEmoji, selectorMode: selector,
        placeholder, buttonStyle
      };

      const summary = categories.map((c, i) =>
        (i + 1) + ". " + c.name + " • Staff " + (c.staffRoleId ? "<@&" + c.staffRoleId + ">" : "None") +
        " • Discord category <#" + c.ticketCategoryId + "> • Transcript " + (c.transcriptChannelId ? "<#" + c.transcriptChannelId + ">" : "panel default")
      ).join("\n");

      const decision = await ask("Final Review • Publish?", "Panel: " + title + "\nSelector: " + selector + "\nCategories: " + categories.length + "\n\n" + summary + "\n\nReply publish to publish or cancel to abort.", x => x.toLowerCase());
      if (decision !== "publish") throw new Error("Setup cancelled.");

      db.createTicketPanel({
        guildId: message.guild.id,
        panelId,
        categories,
        supportRoles: [...new Set(categories.map(c => c.staffRoleId).filter(Boolean))],
        categoryOpen: categories[0]?.ticketCategoryId || null,
        transcriptChannel: categories.find(c => c.transcriptChannelId)?.transcriptChannelId || null,
        reviewChannel: reviewChannelId,
        panelTitle: title,
        panelDescription: description,
        panelColor: color,
        useDropdown: selector === "dropdown",
        autoTranscript,
        panelStyle: style,
        panelChannelId
      });

      const target = message.guild.channels.cache.get(panelChannelId);
      const panelEmbed = buildTicketEmbed(style, { server: message.guild.name });
      const rows = [];
      if (selector === "dropdown") {
        const page = categories.slice(0, 25);
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
          .setCustomId("ticket_create_" + panelId + "_page_0")
          .setPlaceholder(placeholder)
          .addOptions(page.map((cat, i) => ({ label: cat.name.slice(0, 100), description: cat.description.slice(0, 100), value: String(i), emoji: cat.emoji || undefined })))));
        if (categories.length > 25) rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_page_" + panelId + "_1").setLabel("Next").setStyle(ButtonStyle.Secondary)));
      } else {
        const buttons = categories.slice(0, 25).map((cat, i) => {
          const styles = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };
          const b = new ButtonBuilder().setCustomId("ticket_create_" + panelId + "_" + i).setLabel(cat.name.slice(0, 80)).setStyle(styles[buttonStyle]);
          if (cat.emoji) b.setEmoji(cat.emoji);
          return b;
        });
        for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        if (categories.length > 25) rows.push(new ActionRowBuilder().setComponents(new ButtonBuilder().setCustomId("ticket_page_" + panelId + "_1").setLabel("Next").setStyle(ButtonStyle.Secondary)));
      }
      const sent = await target.send({ embeds: [panelEmbed], components: rows.slice(0, 5) });
      db.updateTicketPanel(message.guild.id, panelId, { panel_channel_id: target.id, panel_message_id: sent.id });

      return message.channel.send({ embeds: [buildTicketEmbed({
        title: emoji.get("check") + " Ticket Panel Published",
        description: "Panel ID: " + panelId + "\nChannel: " + target + "\nCategories: " + categories.length + "\nSelector: " + selector,
        color: 0x57F287, timestamp: true
      })] });
    } catch (error) {
      db.decrementPanelCounter(message.guild.id);
      return message.channel.send({ embeds: [buildTicketEmbed({
        title: emoji.get("cross") + " Setup Cancelled",
        description: error.message || "The setup could not be completed.",
        color: 0xED4245, timestamp: true
      })] });
    }
  }
};
