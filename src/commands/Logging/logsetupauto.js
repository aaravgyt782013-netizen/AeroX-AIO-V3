import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { LoggingManager, LOG_TYPES } from "#managers/LoggingManager";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";

function logPanel(title, description, color = 0x5865F2) {
  return new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## ❄️ LIGHTCORE • " + title + "\n\n" + String(description || "").slice(0, 3500)))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# 🛡️ LightCore Server Tools"));
}

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
      return message.reply({ components: [logPanel("📋 LOGGING ENABLED", "Created a private **LIGHTCORE LOGS** category. Server administrators can view it; @everyone is denied access.\n\n" + list + "\n\nUse .showlogs to view current routing.")], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      return message.reply({ components: [logPanel("❌ LOGGING SETUP FAILED", "I could not create the logging category/channels. Check **Manage Channels**, **View Audit Log**, and **Send Messages** permissions.\n\n" + error.message, 0xED4245)], flags: MessageFlags.IsComponentsV2 });
    }
  }

  async slashExecute({ interaction }) {
    const result = await LoggingManager.setup(interaction.guild);
    const list = Object.entries(result.channels).map(([type, id]) => "• **" + type + ":** <#" + id + ">").join("\n");
    return interaction.reply({ components: [logPanel("📋 LOGGING ENABLED", "Private **LIGHTCORE LOGS** category created or updated.\n\n" + list)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
}
export default new LogSetupAuto();
