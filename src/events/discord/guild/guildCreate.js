import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";

function inviteUrl(client) {
  const clientId = config.clientId || client.user?.id;
  return clientId
    ? "https://discord.com/oauth2/authorize?client_id=" +
      clientId +
      "&scope=bot%20applications.commands&permissions=8"
    : null;
}

export default {
  name: "guildCreate",
  async execute(guild, client) {
    try {
      const ownerId = guild.ownerId;
      const owner = ownerId
        ? guild.members.cache.get(ownerId)?.user ||
          await client.users.fetch(ownerId).catch(() => null)
        : null;

      const support = config.links?.supportServer || "https://discord.gg/aerox";
      const addBot = inviteUrl(client);

      db.saveBotGuildContact(
        guild.id,
        ownerId || "unknown",
        guild.name,
        guild.iconURL({ extension: "png", size: 256 }) || null,
      );

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
          name: "LightCore • Successfully Added",
          iconURL: client.user?.displayAvatarURL({ size: 128 }) || undefined,
        })
        .setTitle("🎉 Thanks for adding LightCore!")
        .setDescription(
          "LightCore is now active in **" + guild.name + "**.\n\n" +
          "Your server now has access to music, moderation, utility, automation, " +
          "welcome/leave messages, autoresponders, tickets, TempVoice and more."
        )
        .addFields(
          { name: "🏠 Server", value: guild.name, inline: true },
          { name: "👑 Owner", value: owner ? owner.toString() : (ownerId ? "<@" + ownerId + ">" : "Unknown"), inline: true },
          { name: "👥 Members", value: String(guild.memberCount || 0), inline: true },
          { name: "⚙️ Prefix", value: "`" + config.prefix + "`", inline: true },
          { name: "📖 Getting Started", value: "`" + config.prefix + "help` • `" + config.prefix + "welcome setup` • `" + config.prefix + "autoresponder`", inline: false },
        )
        .setFooter({ text: "LightCore • Thank you for choosing us" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Support Server")
          .setStyle(ButtonStyle.Link)
          .setURL(support),
        ...(addBot
          ? [new ButtonBuilder().setLabel("Invite LightCore").setStyle(ButtonStyle.Link).setURL(addBot)]
          : []),
      );

      if (owner) {
        await owner.send({ embeds: [embed], components: [row] }).catch((error) => {
          logger.debug("GuildCreate", "Could not DM server owner: " + (error?.message || "DM unavailable"));
        });
      }

      logger.success(
        "GuildCreate",
        "LightCore added to " + guild.name + " (" + guild.id + "), owner " + (ownerId || "unknown"),
      );
    } catch (error) {
      logger.error("GuildCreate", "Failed to process new guild notification:", error);
    }
  },
};
