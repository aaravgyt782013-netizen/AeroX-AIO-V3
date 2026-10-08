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
      const icon = guild.iconURL({ extension: "png", size: 512 }) || null;

      db.saveBotGuildContact(guild.id, ownerId || "unknown", guild.name, icon);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
          name: "LightCore • Successfully Added",
          iconURL: client.user?.displayAvatarURL({ size: 128 }) || undefined,
        })
        .setTitle("🎉 Welcome to LightCore!")
        .setDescription(
          "Thank you for adding LightCore to " + guild.name + "!\n\n" +
          "Your server is now ready for an all-in-one Discord experience with music, " +
          "moderation, automation, tickets, TempVoice, welcome systems and much more."
        )
        .addFields(
          { name: "🏠 Server", value: guild.name || "Unknown", inline: true },
          { name: "👑 Owner", value: owner ? owner.toString() : (ownerId ? "<@" + ownerId + ">" : "Unknown"), inline: true },
          { name: "👥 Members", value: String(guild.memberCount || 0), inline: true },
          { name: "⚙️ Prefix", value: config.prefix, inline: true },
          {
            name: "✨ LightCore Features",
            value: "🎵 Music\n🛡️ Moderation & AutoMod\n🤖 Autoresponders & Automation\n👋 Welcome / Leave / Greet\n🎫 Tickets & Support\n🔊 TempVoice\n📊 Logging & Utilities",
            inline: true,
          },
          {
            name: "🚀 Get Started",
            value: config.prefix + "help\n" + config.prefix + "welcome setup\n" + config.prefix + "autoresponder add hello | Hey {user}!",
            inline: true,
          },
        )
        .setFooter({ text: "LightCore • Built for your community" })
        .setTimestamp();

      if (icon) embed.setThumbnail(icon);

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
