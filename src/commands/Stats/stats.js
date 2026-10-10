import { Command } from "#structures/classes/Command";
import { AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { memberStats } from "#managers/MemberStatsManager";

const fmt = value => Number(value || 0).toLocaleString("en-US");
const short = value => {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

class StatsCommand extends Command {
  constructor() {
    super({
      name: "stats",
      description: "View an image dashboard of member activity",
      usage: "stats [@member]",
      aliases: ["guildstats"],
      category: "Stats",
      cooldown: 5,
      enabledSlash: true,
      slashData: { name: "stats", description: "View a member activity stats image", options: [{ type: 6, name: "member", description: "Member to view (defaults to you)", required: false }] },
    });
  }

  async createMemberCard(guild, user) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const s = memberStats.getMemberStats(guild.id, user.id);
    const daily = memberStats.getDailyActivity(guild.id, user.id, 7);
    const channels = memberStats.getTopChannels(guild.id, user.id, 3);
    const W = 1200, H = 760;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Dark, clean analytics card with original LightCore styling.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#10172a");
    bg.addColorStop(1, "#15102c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#202a43";
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath(); ctx.arc((i * 173) % W, (i * 97) % H, 70 + (i % 4) * 18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const panel = (x, y, w, h) => {
      ctx.fillStyle = "rgba(255,255,255,0.055)";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
    };
    const text = (value, x, y, size, color = "#f4f7ff", weight = "600") => {
      ctx.font = `${weight} ${size}px sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(String(value), x, y);
    };
    const line = (x1, y1, x2, y2, color = "rgba(255,255,255,0.10)") => {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };

    // Header / avatar
    ctx.fillStyle = "#8b7cff";
    ctx.beginPath(); ctx.roundRect(42, 38, 9, 72, 5); ctx.fill();
    text("LIGHTCORE  /  MEMBER ANALYTICS", 72, 58, 17, "#aeb8d4", "700");
    text("Member Statistics", 72, 101, 34);
    text(guild.name.length > 38 ? guild.name.slice(0, 35) + "…" : guild.name, 72, 132, 18, "#aeb8d4", "500");

    try {
      const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 256 }));
      ctx.save();
      ctx.beginPath(); ctx.arc(1090, 83, 43, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(avatar, 1047, 40, 86, 86);
      ctx.restore();
      ctx.strokeStyle = "#8b7cff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(1090, 83, 46, 0, Math.PI * 2); ctx.stroke();
    } catch {}
    text(user.username.length > 20 ? user.username.slice(0, 18) + "…" : user.username, 950, 151, 16, "#e4e8f5", "600");

    // Key metrics
    const metricCards = [
      { x: 42, label: "MESSAGES TODAY", value: fmt(s.today), accent: "#8b7cff" },
      { x: 326, label: "LAST 7 DAYS", value: fmt(s.seven_day), accent: "#48d7c1" },
      { x: 610, label: "LAST 30 DAYS", value: fmt(s.thirty_day), accent: "#ffbd69" },
      { x: 894, label: "VOICE TIME", value: `${Math.floor((s.voice_ms || 0) / 3600000)}h ${Math.floor(((s.voice_ms || 0) % 3600000) / 60000)}m`, accent: "#ff7da8" },
    ];
    for (const m of metricCards) {
      panel(m.x, 180, 264, 120);
      ctx.fillStyle = m.accent; ctx.beginPath(); ctx.roundRect(m.x + 20, 200, 5, 68, 3); ctx.fill();
      text(m.label, m.x + 38, 219, 14, "#aeb8d4", "700");
      text(m.value, m.x + 38, 264, 31);
    }

    // Seven-day bar chart
    panel(42, 324, 700, 320);
    text("MESSAGE ACTIVITY", 70, 365, 18);
    text("Last 7 days • tracked messages", 70, 391, 14, "#aeb8d4", "500");
    const chartX = 82, chartY = 430, chartW = 620, chartH = 150;
    const max = Math.max(1, ...daily.map(d => Number(d.messages || 0)));
    line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
    const gap = 22, barW = (chartW - gap * 6) / 7;
    daily.forEach((d, i) => {
      const val = Number(d.messages || 0);
      const bh = Math.max(val > 0 ? 5 : 2, (val / max) * chartH);
      const x = chartX + i * (barW + gap);
      const gradient = ctx.createLinearGradient(0, chartY + chartH - bh, 0, chartY + chartH);
      gradient.addColorStop(0, "#a69aff"); gradient.addColorStop(1, "#6e5bdf");
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(x, chartY + chartH - bh, barW, bh, 8); ctx.fill();
      text(short(val), x, chartY + chartH - bh - 10, 12, "#e9e8ff", "600");
      text(d.label, x - 3, chartY + chartH + 28, 12, "#aeb8d4", "500");
    });
    text(`${fmt(s.messages)} total tracked messages`, 70, 616, 14, "#aeb8d4", "500");

    // Member detail panel
    panel(766, 324, 392, 320);
    text("MEMBER OVERVIEW", 794, 365, 18);
    line(794, 385, 1128, 385);
    text("All-time tracked messages", 794, 420, 14, "#aeb8d4", "500");
    text(fmt(s.messages), 794, 454, 26);
    text("Top channels • last 30 days", 794, 495, 14, "#aeb8d4", "500");
    if (channels.length) {
      channels.forEach((row, i) => {
        const channel = guild.channels.cache.get(row.channel_id);
        text(`#${channel?.name || "deleted-channel"}`, 794, 530 + i * 30, 15, "#e4e8f5", "600");
        text(fmt(row.messages), 1080, 530 + i * 30, 15, "#a69aff", "700");
      });
    } else {
      text("No channel activity tracked yet", 794, 530, 14, "#aeb8d4", "500");
    }
    if (s.last_message_at) {
      text("LAST MESSAGE", 794, 612, 12, "#aeb8d4", "700");
      text(new Date(s.last_message_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), 920, 612, 14, "#e4e8f5", "600");
    }

    line(42, 686, 1158, 686);
    text("Activity tracked by LightCore • historical data starts when tracking was enabled", 42, 721, 14, "#aeb8d4", "500");
    text(member?.joinedTimestamp ? `JOINED ${new Date(member.joinedTimestamp).toLocaleDateString("en-US")}` : "MEMBER", 930, 721, 13, "#aeb8d4", "600");
    return new AttachmentBuilder(await canvas.encode("png"), { name: "lightcore-member-stats.png" });
  }

  async sendStats(guild, user, reply) {
    const image = await this.createMemberCard(guild, user);
    return reply({ content: `📊 **${user.username} — Member Statistics**`, files: [image] });
  }

  async execute({ message, args, client }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    try {
      const id = args[0]?.replace(/[<@!>]/g, "");
      const target = message.mentions.users.first() || (id ? await client.users.fetch(id).catch(() => null) : null) || message.author;
      return await this.sendStats(message.guild, target, options => message.reply(options));
    } catch (error) {
      message.client.logger?.error("StatsCommand", `Could not render member stats image: ${error?.stack || error}`);
      return message.reply("I couldn't generate the member stats image. Please try again shortly.");
    }
  }

  async slashExecute({ interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    await interaction.deferReply();
    try {
      const user = interaction.options.getUser("member") || interaction.user;
      const image = await this.createMemberCard(interaction.guild, user);
      return await interaction.editReply({ content: `📊 **${user.username} — Member Statistics**`, files: [image] });
    } catch (error) {
      interaction.client.logger?.error("StatsCommand", `Could not render member stats image: ${error?.stack || error}`);
      return interaction.editReply({ content: "I couldn't generate the member stats image. Please try again shortly." });
    }
  }
}
export default new StatsCommand();
