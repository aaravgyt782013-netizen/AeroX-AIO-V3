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

class BannersCommand extends Command {
  constructor() {
    super({
      name: "banners",
      description: "Get random aesthetic banners for your profile",
      usage: "banners",
      aliases: ["banner", "profilebanner"],
      category: "Pfps",
      examples: ["banners"],
      cooldown: 5,
    });
  }

  async execute({ client, message, args }) {
    try {
      const loadingMsg = await message.reply({
        content: `${emoji.get("loading")} Fetching banner images...`,
      });

      const imageUrl = await ImageService.getRandomImage("banners");

      if (!imageUrl) {
        return loadingMsg.edit({
          content: `${emoji.get("cross")} Failed to fetch a banner. Please try again!`,
        });
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("banner")} **Profile Banner**`
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
          .setCustomId("banners_new")
          .setLabel("New Banner")
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
      client.logger?.error("BannersCommand", `Error: ${error.message}`, error);
      await message.reply({
        content: `${emoji.get("cross")} An error occurred while fetching banners.`,
      });
    }
  }

  _setupCollector(message, userId, client) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 120_000,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "banners_new") {
        await interaction.deferUpdate();

        const newImageUrl = await ImageService.getRandomImage("banners");

        if (!newImageUrl) {
          return interaction.followUp({
            content: `${emoji.get("cross")} Failed to fetch a new banner.`,
            ephemeral: true,
          });
        }

        const container = new ContainerBuilder();

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("banner")} **Profile Banner**`
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
            .setCustomId("banners_new")
            .setLabel("New Banner")
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
              `${emoji.get("banner")} **Profile Banner**\n*Session expired. Run the command again for new banners.*`
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

export default new BannersCommand();
