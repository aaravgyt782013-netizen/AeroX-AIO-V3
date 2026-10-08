import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import emoji from "#config/emoji";
import ImageService from "#utils/ImageService";

class GirlsCommand extends Command {
  constructor() {
    super({
      name: "girls",
      description: "Get random anime girl profile pictures",
      usage: "girls",
      aliases: ["girlpfp", "girlavatar", "waifu"],
      category: "Pfps",
      examples: ["girls"],
      cooldown: 5,
    });
  }

  async execute({ client, message, args }) {
    try {
      const loadingMsg = await message.reply({
        content: `${emoji.get("loading")} Fetching girl images...`,
      });

      const imageUrl = await ImageService.getRandomImage("waifu");

      if (!imageUrl) {
        return loadingMsg.edit({
          content: `${emoji.get("cross")} Failed to fetch an image. Please try again!`,
        });
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("girl")} **Girl Profile Picture**`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const gallery = new MediaGalleryBuilder()
        .addItems(
          new MediaGalleryItemBuilder().setURL(imageUrl)
        );
      container.addMediaGalleryComponents(gallery);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("girls_new")
          .setLabel("New Image")
          .setStyle(ButtonStyle.Primary)
          .setEmoji(emoji.get("reset")),
        new ButtonBuilder()
          .setLabel("Download")
          .setStyle(ButtonStyle.Link)
          .setURL(imageUrl)
      );

      container.addActionRowComponents(row);

      const sentMsg = await loadingMsg.edit({
        content: null,
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(sentMsg, message.author.id, client);
    } catch (error) {
      client.logger?.error("GirlsCommand", `Error: ${error.message}`, error);
      await message.reply({
        content: `${emoji.get("cross")} An error occurred while fetching images.`,
      });
    }
  }

  _setupCollector(message, userId, client) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 120_000,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "girls_new") {
        await interaction.deferUpdate();

        const newImageUrl = await ImageService.getRandomImage("waifu");

        if (!newImageUrl) {
          return interaction.followUp({
            content: `${emoji.get("cross")} Failed to fetch a new image.`,
            ephemeral: true,
          });
        }

        const container = new ContainerBuilder();

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("girl")} **Girl Profile Picture**`
          )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const gallery = new MediaGalleryBuilder()
          .addItems(
            new MediaGalleryItemBuilder().setURL(newImageUrl)
          );
        container.addMediaGalleryComponents(gallery);

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("girls_new")
            .setLabel("New Image")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(emoji.get("reset")),
          new ButtonBuilder()
            .setLabel("Download")
            .setStyle(ButtonStyle.Link)
            .setURL(newImageUrl)
        );

        container.addActionRowComponents(row);

        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    });

    collector.on("end", async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage) {
          const container = new ContainerBuilder();
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${emoji.get("girl")} **Girl Profile Picture**\n*Session expired. Run the command again for new images.*`
            )
          );
          await fetchedMessage.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }
      } catch (error) {}
    });
  }
}

export default new GirlsCommand();
