import { Command } from "#structures/classes/Command";
import { AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { memberStats } from "#managers/MemberStatsManager";

const WIDTH = 1200;
const HEIGHT = 720;
const number = value => Number(value || 0).toLocaleString("en-US");
function duration(ms) {
  const totalMinutes = Math.floor(Math.max(0, Number(ms) || 0) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function roundedRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function fitText(ctx, text, maxWidth) {
  let result = String(text ?? "");
  while (result.length > 3 && ctx.measureText(result).width > maxWidth) result = result.slice(0, -2) + "…";
  return result;
}
async function renderCard(guild, user, member, stats, channels) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(0.55, "#121a31");
  bg.addColorStop(1, "#20133b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#5865f2";
  ctx.globalAlpha = 0.16;
  ctx.beginPath(); ctx.arc(1080, 35, 230, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(40, 700, 190, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
    ctx.save();
    ctx.beginPath(); ctx.arc(104, 100, 54, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, 50, 46, 108, 108);
    ctx.restore();
  } catch {}
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Inter, sans-serif";
  ctx.fillText(fitText(ctx, member?.displayName || user.globalName || user.username, 760), 182, 83);
  ctx.fillStyle = "#aab4d3";
  ctx.font = "20px Inter, sans-serif";
  ctx.fillText(`Member activity • ${guild.name}`, 184, 119);
  ctx.fillStyle = "#8e9bff";
  ctx.font = "bold 18px Inter, sans-serif";
  ctx.fillText("LIGHTCORE STATS", 940, 84);
  ctx.fillStyle = "#8c97b7";
  ctx.font = "16px Inter, sans-serif";
  ctx.fillText("Tracking starts when the bot records activity", 184, 153);

  const metrics = [
    { label: "MESSAGES TODAY", value: number(stats.today), color: "#60a5fa" },
    { label: "LAST 7 DAYS", value: number(stats.seven_day), color: "#a78bfa" },
    { label: "LAST 30 DAYS", value: number(stats.thirty_day), color: "#34d399" },
    { label: "ALL-TIME MESSAGES", value: number(stats.messages), color: "#fbbf24" },
  ];
  metrics.forEach((item, i) => {
    const x = 52 + i * 285;
    roundedRect(ctx, x, 200, 264, 132, 18, "#1a2340");
    roundedRect(ctx, x, 200, 6, 132, 3, item.color);
    ctx.fillStyle = "#a9b4d1";
    ctx.font = "bold 15px Inter, sans-serif";
    ctx.fillText(item.label, x + 22, 235);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Inter, sans-serif";
    ctx.fillText(item.value, x + 22, 288);
  });

  roundedRect(ctx, 52, 360, 520, 290, 18, "#171f38");
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 23px Inter, sans-serif";
  ctx.fillText("TOP CHANNELS", 78, 403);
  ctx.fillStyle = "#8793b3";
  ctx.font = "16px Inter, sans-serif";
  ctx.fillText("Messages in the last 30 days", 78, 431);
  if (!channels.length) {
    ctx.fillStyle = "#aab4d3";
    ctx.font = "18px Inter, sans-serif";
    ctx.fillText("No channel activity tracked yet", 78, 490);
  } else {
    const max = Math.max(...channels.map(c => Number(c.messages) || 0), 1);
    channels.forEach((channel, i) => {
      const y = 475 + i * 55;
      ctx.fillStyle = "#dbe4ff";
      ctx.font = "bold 17px Inter, sans-serif";
      ctx.fillText(`${i + 1}. ${fitText(ctx, channel.name, 250)}`, 78, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#c3cbed";
      ctx.fillText(number(channel.messages), 540, y);
      ctx.textAlign = "left";
      roundedRect(ctx, 78, y + 12, 440, 8, 4, "#2a3556");
      roundedRect(ctx, 78, y + 12, Math.max(4, 440 * (Number(channel.messages) / max)), 8, 4, "#818cf8");
    });
  }

  roundedRect(ctx, 602, 360, 546, 290, 18, "#171f38");
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 23px Inter, sans-serif";
  ctx.fillText("MORE ACTIVITY", 630, 403);
  const details = [
    ["Voice time tracked", duration(stats.voice_ms)],
    ["Last message", stats.last_message_at ? new Date(stats.last_message_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "No messages yet"],
    ["Server", guild.name],
    ["Data window", "Today • 7 days • 30 days • all-time"],
  ];
  details.forEach(([label, value], i) => {
    const y = 455 + i * 46;
    ctx.fillStyle = "#8e9bbd";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText(label, 630, y);
    ctx.fillStyle = "#e8edff";
    ctx.font = "bold 17px Inter, sans-serif";
    ctx.fillText(fitText(ctx, value, 470), 630, y + 23);
  });
  ctx.fillStyle = "#7581a3";
  ctx.font = "14px Inter, sans-serif";
  ctx.fillText("LIGHTCORE • MEMBER ANALYTICS", 52, 690);
  ctx.textAlign = "right";
  ctx.fillText("Times shown in IST", WIDTH - 52, 690);
  return canvas.toBuffer("image/png");
}

class StatsCommand extends Command {
  constructor() {
    super({
      name: "stats",
      description: "View a member's activity stats as an image card",
      usage: "stats [@member]",
      aliases: ["me", "mystats", "memberactivity"],
      category: "Stats",
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "stats",
        description: "View a member's activity stats card",
        options: [{ type: 6, name: "member", description: "Member to view (defaults to you)", required: false }],
      },
    });
  }

  async sendCard(guild, user, channel) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const stats = memberStats.getMemberStats(guild.id, user.id);
    const top = memberStats.getTopChannels(guild.id, user.id, 3);
    const channels = await Promise.all(top.map(async item => {
      const target = await guild.channels.fetch(item.channel_id).catch(() => null);
      return { name: target?.name ? `#${target.name}` : "Deleted channel", messages: Number(item.messages || 0) };
    }));
    const image = await renderCard(guild, user, member, stats, channels);
    const attachment = new AttachmentBuilder(image, { name: "lightcore-member-stats.png" });
    return channel.reply({ content: `📊 **${member?.displayName || user.username} — activity stats**`, files: [attachment] });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const user = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) || message.author;
    try {
      return await this.sendCard(message.guild, user, message);
    } catch (error) {
      message.client.logger?.error("StatsCommand", `Could not render member stats: ${error?.message || error}`);
      return message.reply("I couldn't generate the stats card. Please try again shortly.");
    }
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    await interaction.deferReply();
    const user = interaction.options.getUser("member") || interaction.user;
    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const stats = memberStats.getMemberStats(interaction.guild.id, user.id);
      const top = memberStats.getTopChannels(interaction.guild.id, user.id, 3);
      const channels = await Promise.all(top.map(async item => {
        const target = await interaction.guild.channels.fetch(item.channel_id).catch(() => null);
        return { name: target?.name ? `#${target.name}` : "Deleted channel", messages: Number(item.messages || 0) };
      }));
      const image = await renderCard(interaction.guild, user, member, stats, channels);
      return interaction.editReply({ content: `📊 **${member?.displayName || user.username} — activity stats**`, files: [new AttachmentBuilder(image, { name: "lightcore-member-stats.png" })] });
    } catch (error) {
      interaction.client.logger?.error("StatsCommand", `Could not render member stats: ${error?.message || error}`);
      return interaction.editReply({ content: "I couldn't generate the stats card. Please try again shortly." });
    }
  }
}
export default new StatsCommand();
