import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { LoggingManager, LOG_TYPES } from "#managers/LoggingManager";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";

class LogSetupAuto extends Command {
  constructor() {
    super({
      name: "logsetupauto",
      description: "Create a private LightCore logging category with every log channel",
      usage: "logsetupauto",
      aliases: ["autologs", "logssetup"],
      category: "Logging",
      cooldown: 10,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewAuditLog],
      enabledSlash: true,
      slashData: { name: "logsetupauto", description: "Create all private LightCore logging channels." },
    });
  }

  async execute({ message }) {
    try {
      const result = await LoggingManager.setup(message.guild);
      const list = Object.entries(result.channels).map(([type, id]) => "• **" + type + ":** <#" + id + ">").join("\n");
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle((emoji.get("category_info") || "📋") + " LightCore Logging Enabled")
        .setDescription("Created a private **LIGHTCORE LOGS** category. Server administrators can view it; @everyone is denied access.\n\n" + list)
        .setFooter({ text: "Use .showlogs to view the current routing." })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    } catch (error) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("❌ Logging Setup Failed").setDescription("I could not create the logging category/channels. Make sure I have **Manage Channels**, **View Audit Log**, **Send Messages**, and **Embed Links**.\n\n" + error.message)] });
    }
  }

  async slashExecute({ interaction }) {
    const result = await LoggingManager.setup(interaction.guild);
    const list = Object.entries(result.channels).map(([type, id]) => "• **" + type + ":** <#" + id + ">").join("\n");
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle((emoji.get("category_info") || "📋") + " LightCore Logging Enabled").setDescription("Private **LIGHTCORE LOGS** category created/updated.\n\n" + list).setTimestamp()], ephemeral: true });
  }
}
export default new LogSetupAuto();
