import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { leveling } from "#managers/LevelingManager";
import { db } from "#database/DatabaseManager";

class LevelConfigCommand extends Command {
  constructor() {
    super({
      name: "levelconfig",
      description: "Configure LightCore XP rates, cooldown, announcements, and leveling status",
      usage: "levelconfig <show|off|on|xp <min> <max>|cooldown <seconds>|channel <#channel|off>|message <text|reset>|enabled <on|off>>",
      aliases: ["levelsettings", "levelsetup"],
      category: "Leveling",
      cooldown: 4,
      examples: ["levelconfig show", "levelconfig off", "levelconfig on", "levelconfig xp 15 25", "levelconfig channel #levels"],
    });
  }

  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!message.member.permissions.has("ManageGuild")) return message.reply("You need **Manage Server** permission to configure leveling.");
    const action = (args[0] || "show").toLowerCase();
    const current = leveling.getSettings(message.guild.id);
    try {
      if (action === "off" || action === "on") {\n        leveling.configure(message.guild.id, { enabled: action === "on" });\n      } else if (action === "xp") {
        const min = Number(args[1]);
        const max = Number(args[2]);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max > 1000) {
          return message.reply("Usage: `levelconfig xp <min XP> <max XP>` (0–1000).");
        }
        leveling.configure(message.guild.id, { min_xp: min, max_xp: max });
      } else if (action === "cooldown") {
        const seconds = Number(args[1]);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) return message.reply("Cooldown must be 0–86400 seconds.");
        leveling.configure(message.guild.id, { cooldown_ms: seconds * 1000 });
      } else if (action === "channel") {
        const raw = (args[1] || "").toLowerCase();
        if (!raw) return message.reply("Usage: `levelconfig channel <#channel|off>`.");
        if (raw === "off") leveling.configure(message.guild.id, { announcement_channel_id: null });
        else {
          const channel = message.mentions.channels.first() || await message.guild.channels.fetch(raw.replace(/[<#>]/g, "")).catch(() => null);
          if (!channel?.isTextBased?.()) return message.reply("Choose a text channel or use `off`.");
          leveling.configure(message.guild.id, { announcement_channel_id: channel.id });
        }
      } else if (action === "message") {
        if (!db.isGuildPremium(message.guild.id)) return message.reply("Custom level-up messages are a **Guild Premium** feature. Upgrade this server to use them.");
        const text = args.slice(1).join(" ").trim();
        if (!text) return message.reply("Usage: `levelconfig message <your message>` or `levelconfig message reset`. Placeholders: `{user}`, `{username}`, `{level}`, `{xp}`, `{server}`.");
        if (text.toLowerCase() === "reset") leveling.configure(message.guild.id, { announcement_text: null });
        else {
          if (text.length > 1500) return message.reply("Custom level-up messages must be 1500 characters or fewer.");
          leveling.configure(message.guild.id, { announcement_text: text });
        }
      } else if (action === "enabled") {
        const value = (args[1] || "").toLowerCase();
        if (!["on", "off"].includes(value)) return message.reply("Usage: `levelconfig enabled <on|off>`.");
        leveling.configure(message.guild.id, { enabled: value === "on" });
      } else if (action !== "show") {
        return message.reply("Usage: `levelconfig <show|off|on|xp <min> <max>|cooldown <seconds>|channel <#channel|off>|message <text|reset>|enabled <on|off>`.");
      }
      const settings = leveling.getSettings(message.guild.id);
      const channel = settings.announcement_channel_id ? `<#${settings.announcement_channel_id}>` : "Current message channel";
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚙️ LightCore Leveling Settings")
        .setDescription([
          `**Status:** ${settings.enabled ? "Enabled" : "Disabled"}`,
          `**XP per message:** ${settings.min_xp}–${settings.max_xp}`,
          `**XP cooldown:** ${Number(settings.cooldown_ms) / 1000}s`,
          `**Level-up announcements:** ${channel}`,
          `**Custom message:** ${settings.announcement_text ? "Configured (Guild Premium)" : "Default"}`,
          "",
          "**Commands**",
          "`levelconfig off` — disable leveling for this server",\n          "`levelconfig on` — enable leveling for this server",\n          "`levelconfig xp 15 25` — set XP range",
          "`levelconfig cooldown 60` — set cooldown",
          "`levelconfig channel #levels` — set announcement channel",
          "`levelconfig channel off` — announce in the message channel",
          "`levelconfig message <text>` — set a custom level-up message (Guild Premium)",
          "`levelconfig message reset` — restore the default level-up message",
          "`levelconfig enabled on/off` — toggle leveling",
        ].join("\n"))
        .setFooter({ text: "Manage Server permission required." });
      return message.reply({ embeds: [embed] });
    } catch (error) {
      message.client.logger?.error("LevelConfig", error);
      return message.reply("Could not update leveling settings. Check the XP range and try again.");
    }
  }
}

export default new LevelConfigCommand();
