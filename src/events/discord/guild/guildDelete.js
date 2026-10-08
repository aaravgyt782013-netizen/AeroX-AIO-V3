import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import { config } from "#config/config";

export default {
  name: "guildDelete",
  async execute(guild, client) {
    try {
      const saved = db.getBotGuildContact(guild.id);
      const clientId = config.clientId || client.user?.id;
      const invite = clientId
        ? "https://discord.com/oauth2/authorize?client_id=" +
          clientId +
          "&scope=bot%20applications.commands&permissions=8"
        : null;
      const support = config.links?.supportServer || "https://discord.gg/aerox";

      const targetIds = [];
      if (saved?.owner_id && saved.owner_id !== "unknown") targetIds.push(saved.owner_id);
      if (guild.ownerId && !targetIds.includes(guild.ownerId)) targetIds.push(guild.ownerId);

      for (const [, member] of guild.members.cache) {
        if (
          member.user.bot ||
          !member.permissions.has("Administrator") ||
          targetIds.includes(member.id)
        ) continue;
        targetIds.push(member.id);
        if (targetIds.length >= 5) break;
      }

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setAuthor({
          name: "LightCore • Server Removal",
          iconURL: client.user?.displayAvatarURL({ size: 128 }) || undefined,
        })
        .setTitle("👋 LightCore has left " + (saved?.guild_name || guild.name))
        .setDescription(
          "LightCore was removed from your server or the server was deleted.\n\n" +
          "If this was intentional, no action is required. If you want LightCore back, " +
          "you can add it again using the button below."
        )
        .addFields(
          { name: "🏠 Server", value: saved?.guild_name || guild.name || "Unknown Server", inline: true },
          { name: "🆔 Server ID", value: guild.id, inline: true },
          { name: "📌 Reason", value: "Removed / kicked / server unavailable", inline: false },
        )
        .setFooter({ text: "LightCore • We hope to see you again" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Support Server").setStyle(ButtonStyle.Link).setURL(support),
        ...(invite
          ? [new ButtonBuilder().setLabel("Re-add LightCore").setStyle(ButtonStyle.Link).setURL(invite)]
          : []),
      );

      for (const userId of targetIds) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          await user.send({ embeds: [embed], components: [row] }).catch(() => null);
        }
      }

      db.deleteBotGuildContact(guild.id);
      logger.warn(
        "GuildDelete",
        "LightCore was removed from " + (saved?.guild_name || guild.name) + " (" + guild.id + ")",
      );
    } catch (error) {
      logger.error("GuildDelete", "Failed to notify server administration after removal:", error);
    }

    if (client.inviteCache?.has(guild.id)) {
      client.inviteCache.delete(guild.id);
      logger.debug("GuildDelete", `Cleaned invite cache for guild ${guild.id} (${guild.name})`);
    }
  },
};
