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

class CouplesCommand extends Command {
  constructor() {
    super({
      name: "couples",
      description: "Get random anime couple profile pictures",
      usage: "couples",
      aliases: ["couplepfp", "coupleavatar", "pair"],
      category: "Pfps",
      examples: ["couples"],
      cooldown: 5,
    });
  }

  async execute({ client, message, args }) {
    try {
      const loadingMsg = await message.reply({
        content: `${emoji.get("loading")} Fetching couple images...`,
      });

      const [image1, image2] = await Promise.all([
        ImageService.getRandomImage("waifu"),
        ImageService.getRandomImage("husbando"),
      ]);

      if (!image1 && !image2) {
        return loadingMsg.edit({
          content: `${emoji.get("cross")} Failed to fetch images. Please try again!`,
        });
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("couple")} **Couple Profile Pictures**`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Partner 1:**`)
      );

      if (image1) {
        const gallery1 = new MediaGalleryBuilder()
          .addItems(new MediaGalleryItemBuilder().setURL(image1));
        container.addMediaGalleryComponents(gallery1);
      }

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Partner 2:**`)
      );

      if (image2) {
        const gallery2 = new MediaGalleryBuilder()
          .addItems(new MediaGalleryItemBuilder().setURL(image2));
        container.addMediaGalleryComponents(gallery2);
      }

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("couples_new")
          .setLabel("New Couple")
          .setStyle(ButtonStyle.Primary)
          .setEmoji(emoji.get("reset"))
      );

      container.addActionRowComponents(row);

      const sentMsg = await loadingMsg.edit({
        content: null,
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(sentMsg, message.author.id, client);
    } catch (error) {
      client.logger?.error("CouplesCommand", `Error: ${error.message}`, error);
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
      if (interaction.customId === "couples_new") {
        await interaction.deferUpdate();

        const [image1, image2] = await Promise.all([
          ImageService.getRandomImage("waifu"),
          ImageService.getRandomImage("husbando"),
        ]);

        if (!image1 && !image2) {
          return interaction.followUp({
            content: `${emoji.get("cross")} Failed to fetch new images.`,
            ephemeral: true,
          });
        }

        const container = new ContainerBuilder();

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("couple")} **Couple Profile Pictures**`
          )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Partner 1:**`)
        );

        if (image1) {
          const gallery1 = new MediaGalleryBuilder()
            .addItems(new MediaGalleryItemBuilder().setURL(image1));
          container.addMediaGalleryComponents(gallery1);
        }

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Partner 2:**`)
        );

        if (image2) {
          const gallery2 = new MediaGalleryBuilder()
            .addItems(new MediaGalleryItemBuilder().setURL(image2));
          container.addMediaGalleryComponents(gallery2);
        }

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("couples_new")
            .setLabel("New Couple")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(emoji.get("reset"))
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
              `${emoji.get("couple")} **Couple Profile Pictures**\n*Session expired. Run the command again for new images.*`
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

export default new CouplesCommand();
