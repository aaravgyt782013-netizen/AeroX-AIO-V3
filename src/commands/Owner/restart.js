import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import emoji from "#config/emoji";
import { config } from "#config/config";
import { flushNeonSnapshots } from "#database/neon/snapshots";

class RestartCommand extends Command {
  constructor() {
    super({
      name: "restart",
      description: "Restart the bot",
      usage: "restart",
      aliases: ["reboot"],
      category: "Owner",
      examples: ["restart"],
      cooldown: 0,
      ownerOnly: true,
    });
  }

  async execute({ client, message, args }) {
    try {
      if (!config.ownerIds?.includes(message.author.id)) {
        return message.reply({
          content: `${emoji.get("cross")} This command is only available to bot owners.`,
        });
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("restart")} **Bot Restarting**`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `The bot is now restarting...\n` +
          `This may take a few moments.`
        )
      );

      await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      setTimeout(async () => {
        try {
          await flushNeonSnapshots();
          process.exit(0);
        } catch (error) {
          client.logger?.error("RestartCommand", "Neon persistence flush failed; restart cancelled to avoid losing recent data.", error);
          await message.channel.send("⚠️ Restart cancelled because the database backup could not be confirmed. Check the bot logs and Neon connection.");
        }
      }, 2000);
    } catch (error) {
      client.logger?.error("RestartCommand", `Error: ${error.message}`, error);
      await message.reply({
        content: `${emoji.get("cross")} An error occurred while restarting.`,
      });
    }
  }
}

export default new RestartCommand();
