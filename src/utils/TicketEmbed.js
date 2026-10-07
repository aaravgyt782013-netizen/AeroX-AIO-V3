import { EmbedBuilder } from "discord.js";
import emoji from "#config/emoji";

const DEFAULTS = { color: 0x5865F2, title: "Support Tickets", description: "Choose a category below to open a ticket.", footer: "AeroX Ticket System" };
export function parseColor(value, fallback = DEFAULTS.color) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const raw = String(value ?? "").trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(raw) ? parseInt(raw, 16) : fallback;
}
export function buildTicketEmbed(style = {}, vars = {}) {
  const e = new EmbedBuilder().setColor(parseColor(style.color));
  const title = String(style.title ?? DEFAULTS.title).replaceAll("{server}", vars.server ?? "");
  const description = String(style.description ?? DEFAULTS.description).replaceAll("{server}", vars.server ?? "");
  if (style.panelEmoji && title && !title.startsWith(String(style.panelEmoji))) e.setTitle(String(style.panelEmoji) + " " + title.slice(0, 245));
  else if (title) e.setTitle(title.slice(0, 256));
  if (description) e.setDescription(description.slice(0, 4096));
  if (style.url) e.setURL(String(style.url).slice(0, 2000));
  if (style.image) e.setImage(String(style.image).slice(0, 2000));
  if (style.thumbnail) e.setThumbnail(String(style.thumbnail).slice(0, 2000));
  if (style.authorName) e.setAuthor({ name: String(style.authorName).slice(0, 256), ...(style.authorIcon ? { iconURL: String(style.authorIcon) } : {}) });
  if (style.footer || style.footerIcon) e.setFooter({ text: String(style.footer || DEFAULTS.footer).slice(0, 2048), ...(style.footerIcon ? { iconURL: String(style.footerIcon) } : {}) });
  if (style.timestamp) e.setTimestamp();
  return e;
}
export function successEmbed(title, description) { return buildTicketEmbed({ title: emoji.get("check") + " " + title, description, color: 0x57F287, timestamp: true }); }
export function errorEmbed(title, description) { return buildTicketEmbed({ title: emoji.get("cross") + " " + title, description, color: 0xED4245, timestamp: true }); }