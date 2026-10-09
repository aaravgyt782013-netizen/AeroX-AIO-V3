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
import { db } from "#database/DatabaseManager";

class NoPrefixCommand extends Command {
  constructor() {
    super({
      name: "noprefix",
      description: "Toggle no-prefix mode for a user",
      usage: "noprefix <add|remove|list> [user_id]",
      aliases: ["np", "nopre"],
      category: "Owner",
      examples: [
        "noprefix add 123456789",
        "noprefix remove 123456789",
        "noprefix list",
      ],
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

      if (!client.noPrefixUsers) {
        client.noPrefixUsers = new Set();
      }

      const action = args[0]?.toLowerCase();

      if (!action || !["add", "remove", "list"].includes(action)) {
        return message.reply({
          content: `${emoji.get("cross")} Please specify an action: \`add\`, \`remove\`, or \`list\`\n**Usage:** \`${this.usage}\``,
        });
      }

      if (action === "list") {
        const container = new ContainerBuilder();

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("info")} **No-Prefix Users**`
          )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        if (client.noPrefixUsers.size === 0) {
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent("No users have no-prefix mode enabled.")
          );
        } else {
          let userList = "";
          let count = 0;
          for (const userId of client.noPrefixUsers) {
            count++;
            let user = null;
            try {
              user = await client.users.fetch(userId);
            } catch (e) {}
            userList += `**${count}.** ${user ? user.tag : "Unknown"} (\`${userId}\`)\n`;
          }
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(userList)
          );
        }

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const userId = args[1]?.replace(/[<@!>]/g, "");

      if (!userId || !/^\d{17,19}$/.test(userId)) {
        return message.reply({
          content: `${emoji.get("cross")} Please provide a valid user ID!`,
        });
      }

      if (action === "add" && !db.isUserPremium(userId)) {
        return message.reply({
          content: `${emoji.get("cross")} No-prefix is a **User Premium** perk. Grant active User Premium first, then enable no-prefix.`,
        });
      }

      if (action === "add") {
        if (client.noPrefixUsers.has(userId)) {
          return message.reply({
            content: `${emoji.get("cross")} This user already has no-prefix mode enabled!`,
          });
        }

        client.noPrefixUsers.add(userId);
        db.setNoPrefix(userId, true);

        let user = null;
        try {
          user = await client.users.fetch(userId);
        } catch (e) {}

        const container = new ContainerBuilder();

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("check")} **No-Prefix Enabled**`
          )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**User:** ${user ? user.tag : "Unknown"}\n` +
            `**ID:** \`${userId}\`\n\n` +
            `This user can now use commands without a prefix.`
          )
        );

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (action === "remove") {
        if (!client.noPrefixUsers.has(userId)) {
          return message.reply({
            content: `${emoji.get("cross")} This user doesn't have no-prefix mode enabled!`,
          });
        }

        client.noPrefixUsers.delete(userId);
        db.setNoPrefix(userId, false);

        let user = null;
        try {
          user = await client.users.fetch(userId);
        } catch (e) {}

        const container = new ContainerBuilder();

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("check")} **No-Prefix Disabled**`
          )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**User:** ${user ? user.tag : "Unknown"}\n` +
            `**ID:** \`${userId}\`\n\n` +
            `This user must now use a prefix for commands.`
          )
        );

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (error) {
      client.logger?.error("NoPrefixCommand", `Error: ${error.message}`, error);
      await message.reply({
        content: `${emoji.get("cross")} An error occurred.`,
      });
    }
  }
}

export default new NoPrefixCommand();
