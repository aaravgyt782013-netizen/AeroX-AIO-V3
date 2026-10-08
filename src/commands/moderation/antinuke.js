import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { config } from "#config/config";
import { antiNuke } from "#utils/AntiNuke";

const ownerOnly = ctx => {
  const id = ctx.user?.id || ctx.author?.id;
  return id === ctx.guild?.ownerId || config.ownerIds?.includes(id);
};

const card = (title, description, color = 0x5865F2) =>
  new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();

const help = [
  "**🛡️ LightCore Anti-Nuke**",
  ".antinuke on — enable protection",
  ".antinuke off — disable protection",
  ".antinuke status — show configuration",
  ".antinuke punishment <quarantine|kick|ban>",
  ".antinuke threshold <action> <number>",
  ".antinuke whitelist user add|remove <@user>",
  ".antinuke whitelist role add|remove <@role>",
  ".antinuke whitelist list",
  ".antinuke log <#channel>",
  ".antinuke reset",
  "",
  "**Protected actions:** channel/role raids, mass bans/kicks, webhooks, bot additions, emoji/sticker deletion, integrations, dangerous role changes and rapid guild/AutoMod changes."
].join("\n");

const actionAliases = {
  channel: "channelDelete", channeldelete: "channelDelete", channelcreate: "channelCreate",
  role: "roleDelete", roledelete: "roleDelete", rolecreate: "roleCreate",
  ban: "memberBan", bans: "memberBan", kick: "memberKick",
  webhook: "webhook", bot: "botAdd", emoji: "emojiDelete", sticker: "stickerDelete",
  integration: "integration", guild: "guildUpdate", memberrole: "memberRoleUpdate"
};

export default {
  name: "antinuke",
  description: "Protect the server from destructive administrator actions",
  usage: "antinuke <on|off|status|punishment|threshold|whitelist|log|reset>",
  aliases: ["anti-nuke", "an"],
  category: "moderation",
  cooldown: 3,
  userPermissions: [PermissionFlagsBits.Administrator],
  permissions: [PermissionFlagsBits.Administrator],
  enabledSlash: false,

  async execute({ message, args }) {
    if (!ownerOnly(message)) {
      return message.reply({ embeds: [card("🛡️ Anti-Nuke", "Only the server owner or configured bot owner can change Anti-Nuke settings.", 0xED4245)] });
    }

    const guildId = message.guild.id;
    const sub = String(args[0] || "status").toLowerCase();

    if (sub === "on" || sub === "enable") {
      const s = antiNuke.save(guildId, { enabled: true });
      return message.reply({ embeds: [card("🛡️ Anti-Nuke Enabled", antiNuke.formatStatus(s), 0x57F287)] });
    }

    if (sub === "off" || sub === "disable") {
      antiNuke.save(guildId, { enabled: false });
      return message.reply({ embeds: [card("🛡️ Anti-Nuke Disabled", "Protection is currently disabled.", 0xED4245)] });
    }

    if (sub === "status") {
      const s = antiNuke.get(guildId);
      const thresholds = Object.entries(s.thresholds).map(([k, v]) => "• " + k + ": **" + v + " / " + (s.windowMs / 1000) + "s**").join("\n");
      return message.reply({ embeds: [card("🛡️ LightCore Anti-Nuke", antiNuke.formatStatus(s) + "\n\n**Thresholds**\n" + thresholds)] });
    }

    if (sub === "punishment") {
      const value = String(args[1] || "").toLowerCase();
      if (!["quarantine", "kick", "ban"].includes(value)) {
        return message.reply({ embeds: [card("🛡️ Anti-Nuke", "Use quarantine, kick, or ban.", 0xED4245)] });
      }
      antiNuke.save(guildId, { punishment: value });
      return message.reply({ embeds: [card("🛡️ Punishment Updated", "Future threshold violations will use **" + value + "**.", 0x57F287)] });
    }

    if (sub === "threshold") {
      const actionKey = String(args[1] || "").toLowerCase().replace(/[-_]/g, "");
      const action = actionAliases[actionKey] || String(args[1] || "");
      const value = Number(args[2]);
      const current = antiNuke.get(guildId);
      if (!Object.hasOwn(current.thresholds, action) || !Number.isInteger(value) || value < 1 || value > 25) {
        return message.reply({ embeds: [card("🛡️ Anti-Nuke", "Invalid action/number. Example: .antinuke threshold channeldelete 3.", 0xED4245)] });
      }
      antiNuke.save(guildId, { thresholds: { [action]: value } });
      return message.reply({ embeds: [card("🛡️ Threshold Updated", "**" + action + "** is now **" + value + " actions / " + (current.windowMs / 1000) + "s**.", 0x57F287)] });
    }

    if (sub === "whitelist") {
      const type = String(args[1] || "").toLowerCase();
      const action = String(args[2] || "").toLowerCase();
      const current = antiNuke.get(guildId);

      if (action === "list") {
        return message.reply({ embeds: [card("🛡️ Anti-Nuke Whitelist",
          "**Users:** " + (current.whitelistUsers.length ? current.whitelistUsers.map(id => "<@" + id + ">").join(", ") : "None") +
          "\n**Roles:** " + (current.whitelistRoles.length ? current.whitelistRoles.map(id => "<@&" + id + ">").join(", ") : "None"))] });
      }

      if (!["user", "role"].includes(type) || !["add", "remove"].includes(action)) {
        return message.reply({ embeds: [card("🛡️ Anti-Nuke", "Use .antinuke whitelist user|role add|remove <mention>.", 0xED4245)] });
      }

      const target = type === "role"
        ? (message.mentions.roles.first() || message.guild.roles.cache.get(args[3]))
        : (message.mentions.users.first() || message.guild.members.cache.get(args[3])?.user);

      if (!target) {
        return message.reply({ embeds: [card("🛡️ Anti-Nuke", "I could not find that user/role.", 0xED4245)] });
      }

      const key = type === "role" ? "whitelistRoles" : "whitelistUsers";
      const list = [...current[key]];
      const next = action === "add" ? [...new Set([...list, target.id])] : list.filter(id => id !== target.id);
      antiNuke.save(guildId, { [key]: next });
      return message.reply({ embeds: [card("🛡️ Whitelist Updated",
        (action === "add" ? "Added " : "Removed ") + (type === "role" ? "<@&" : "<@") + target.id + ">" + (action === "add" ? " to" : " from") + " the Anti-Nuke whitelist.", 0x57F287)] });
    }

    if (sub === "log") {
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!channel?.isTextBased?.()) {
        return message.reply({ embeds: [card("🛡️ Anti-Nuke", "Mention a text channel.", 0xED4245)] });
      }
      antiNuke.save(guildId, { logChannel: channel.id });
      return message.reply({ embeds: [card("🛡️ Security Log Channel", "Anti-Nuke alerts will be sent to <#" + channel.id + ">.", 0x57F287)] });
    }

    if (sub === "reset") {
      antiNuke.reset(guildId);
      return message.reply({ embeds: [card("🛡️ Anti-Nuke Reset", "Settings reset. Protection is disabled until you enable it.", 0xFEE75C)] });
    }

    return message.reply({ embeds: [card("🛡️ LightCore Anti-Nuke Help", help)] });
  }
};
