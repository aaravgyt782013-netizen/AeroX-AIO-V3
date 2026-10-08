import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ComponentType,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
} from "discord.js";
import emoji from "#config/emoji";
import { config } from "#config/config";
import fs from "fs";
import path from "path";
import { logger } from "#utils/logger";

class HelpCommand extends Command {
  constructor() {
    super({
      name: "help",
      description: "Shows all available commands and their information",
      usage: "help [command]",
      aliases: ["h", "commands"],
      category: "info",
      examples: ["help", "help play", "help music", "h skip"],
      cooldown: 3,
      enabledSlash: true,
      slashData: {
        name: "help",
        description: "Get help for commands",
        options: [
          {
            name: "command",
            description: "Specific command to get help for",
            type: 3,
            required: false,
            autocomplete: true,
          },
        ],
      },
    });
  }

  async _scanCommandDirectories(client = null) {
    try {
      const commands = new Map();
      const categories = new Map();
      const subcategories = new Map();

      const registered = client?.commandHandler?.commands;
      if (registered?.size) {
        for (const command of registered.values()) {
          if (!command?.name) continue;
          const rawCategory = String(command.category || "misc").replaceAll("\\", "/");
          const parts = rawCategory.split("/").filter(Boolean);
          const rootCategory = parts[0] || "misc";
          const subcategory = parts.slice(1).join("/") || null;
          if (!categories.has(rootCategory)) categories.set(rootCategory, []);
          const list = categories.get(rootCategory);
          if (!list.some(item => item.name === command.name)) list.push(command);
          commands.set(command.name, command);
          for (const alias of command.aliases || []) commands.set(alias, command);
          if (subcategory) {
            if (!subcategories.has(rootCategory)) subcategories.set(rootCategory, new Map());
            const rootSubs = subcategories.get(rootCategory);
            if (!rootSubs.has(subcategory)) rootSubs.set(subcategory, []);
            const subList = rootSubs.get(subcategory);
            if (!subList.some(item => item.name === command.name)) subList.push(command);
          }
        }
        this._injectVirtualChannelCategory(commands, categories, subcategories);
        this._normalizeHelpCategories(categories, subcategories);
        return { commands, categories, subcategories };
      }

      const commandsPath = path.join(process.cwd(), "src", "commands");
      if (!fs.existsSync(commandsPath)) {
        logger.warn("HelpCommand", "Commands directory not found");
        return { commands, categories, subcategories };
      }

      const categoryDirs = fs
        .readdirSync(commandsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .filter((name) => name !== "developer");

      for (const categoryName of categoryDirs) {
        const categoryPath = path.join(commandsPath, categoryName);

        if (!categories.has(categoryName)) {
          categories.set(categoryName, []);
        }

        await this._scanCategoryDirectory(
          categoryPath,
          categoryName,
          commands,
          categories,
          subcategories,
        );
      }

      this._injectVirtualChannelCategory(commands, categories, subcategories);
      this._normalizeHelpCategories(categories, subcategories);
      return { commands, categories, subcategories };
    } catch (error) {
      logger.error("HelpCommand", "Error scanning command directories:", error);
      return {
        commands: new Map(),
        categories: new Map(),
        subcategories: new Map(),
      };
    }
  }

  async _scanCategoryDirectory(
    categoryPath,
    categoryName,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const items = fs.readdirSync(categoryPath, { withFileTypes: true });

      const commandFiles = items
        .filter((item) => item.isFile() && item.name.endsWith(".js"))
        .map((item) => item.name);

      for (const file of commandFiles) {
        await this._loadCommand(
          path.join(categoryPath, file),
          categoryName,
          commands,
          categories,
        );
      }

      const subdirs = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      if (subdirs.length > 0) {
        if (!subcategories.has(categoryName)) {
          subcategories.set(categoryName, new Map());
        }

        const categorySubcats = subcategories.get(categoryName);

        for (const subdir of subdirs) {
          const subdirPath = path.join(categoryPath, subdir);
          const subcategoryCommands = [];

          const subCommandFiles = fs
            .readdirSync(subdirPath, { withFileTypes: true })
            .filter((item) => item.isFile() && item.name.endsWith(".js"))
            .map((item) => item.name);

          for (const file of subCommandFiles) {
            const command = await this._loadCommand(
              path.join(subdirPath, file),
              categoryName,
              commands,
              categories,
            );
            if (command) {
              subcategoryCommands.push(command);
            }
          }

          if (subcategoryCommands.length > 0) {
            categorySubcats.set(subdir, subcategoryCommands);
          }
        }
      }
    } catch (error) {
      logger.error(
        "HelpCommand",
        `Error scanning category directory ${categoryName}:`,
        error,
      );
    }
  }

  async _loadCommand(filePath, categoryName, commands, categories) {
    try {
      const { default: CommandClass } = await import(filePath);

      if (!CommandClass || typeof CommandClass !== "object") {
        return null;
      }

      const command = {
        ...CommandClass,
        category: categoryName,
      };

      commands.set(command.name, command);

      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          commands.set(alias, command);
        }
      }

      const categoryCommands = categories.get(categoryName);
      if (!categoryCommands.find((cmd) => cmd.name === command.name)) {
        categoryCommands.push(command);
      }

      return command;
    } catch (error) {
      logger.error(
        "HelpCommand",
        `Error loading command from ${filePath}:`,
        error,
      );
      return null;
    }
  }

  async execute({ client, message, args }) {
    try {
      const { commands, categories, subcategories } =
        await this._scanCommandDirectories(client);

      if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        const command = commands.get(commandName);

        if (command) {
          return await this._sendCommandHelp(
            message,
            command,
            "message",
            client,
            commands,
            categories,
            subcategories,
          );
        } else {
          return message.reply({
            components: [
              this._createErrorContainer(`Command "${commandName}" not found.`),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }

      if (categories.size === 0) {
        return message.reply({
          components: [this._createErrorContainer("No commands available.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const helpMessage = await message.reply({
        components: [
          this._createMainContainer(commands, categories, subcategories),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(
        helpMessage,
        message.author.id,
        client,
        commands,
        categories,
        subcategories,
      );
    } catch (error) {
      client.logger?.error(
        "HelpCommand",
        `Error in prefix command: ${error.message}`,
        error,
      );
      await message
        .reply({
          components: [
            this._createErrorContainer("An error occurred while loading help."),
          ],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const { commands, categories, subcategories } =
        await this._scanCommandDirectories(client);
      const commandName = interaction.options.getString("command");

      if (commandName) {
        const command = commands.get(commandName.toLowerCase());

        if (command) {
          return await this._sendCommandHelp(
            interaction,
            command,
            "interaction",
            client,
            commands,
            categories,
            subcategories,
          );
        } else {
          return interaction.reply({
            components: [
              this._createErrorContainer(`Command "${commandName}" not found.`),
            ],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true,
          });
        }
      }

      if (categories.size === 0) {
        return interaction.reply({
          components: [this._createErrorContainer("No commands available.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const helpMessage = await interaction.reply({
        components: [
          this._createMainContainer(commands, categories, subcategories),
        ],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      this._setupCollector(
        helpMessage,
        interaction.user.id,
        client,
        commands,
        categories,
        subcategories,
      );
    } catch (error) {
      client.logger?.error(
        "HelpCommand",
        `Error in slash command: ${error.message}`,
        error,
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            components: [
              this._createErrorContainer(
                "An error occurred while loading help.",
              ),
            ],
          });
        } else {
          await interaction.reply({
            components: [
              this._createErrorContainer(
                "An error occurred while loading help.",
              ),
            ],
            ephemeral: true,
          });
        }
      } catch (e) {
        logger.error("HelpCommand", "Failed to send error response:", e);
      }
    }
  }

  async autocomplete({ interaction, client }) {
    try {
      const { commands } = await this._scanCommandDirectories(client);
      const focusedValue = interaction.options.getFocused();

      const uniqueCommands = new Set();
      for (const [name, command] of commands) {
        if (command.name === name) {
          uniqueCommands.add(name);
        }
      }

      const choices = Array.from(uniqueCommands)
        .filter((name) =>
          name.toLowerCase().includes(focusedValue.toLowerCase()),
        )
        .slice(0, 25)
        .map((name) => ({ name, value: name }));

      await interaction.respond(choices);
    } catch (error) {
      await interaction.respond([]).catch(() => {});
    }
  }

  _normalizeHelpCategories(categories, subcategories) {
    const canonicalName = (raw) => {
      const key = String(raw || "").trim().toLowerCase();
      if (key === "channel") return "Channel";
      if (key === "music" || key === "rythmusic") return "Music";
      if (!key) return "Misc";
      return String(raw).trim().charAt(0).toUpperCase() + String(raw).trim().slice(1);
    };

    const mergedCategories = new Map();
    const mergedSubcategories = new Map();

    for (const [rawCategory, list] of categories.entries()) {
      const category = canonicalName(rawCategory);
      if (!mergedCategories.has(category)) mergedCategories.set(category, []);

      const target = mergedCategories.get(category);
      for (const command of list || []) {
        if (!command?.name) continue;
        if (!target.some(existing => existing.name === command.name)) {
          command.category = category;
          target.push(command);
        }
      }

      const rawSubs = subcategories.get(rawCategory);
      if (rawSubs) {
        if (!mergedSubcategories.has(category)) {
          mergedSubcategories.set(category, new Map());
        }
        const targetSubs = mergedSubcategories.get(category);

        for (const [subName, subCommands] of rawSubs.entries()) {
          if (!targetSubs.has(subName)) targetSubs.set(subName, []);
          const targetList = targetSubs.get(subName);

          for (const command of subCommands || []) {
            if (!command?.name) continue;
            if (!targetList.some(existing => existing.name === command.name)) {
              command.category = category;
              targetList.push(command);
            }
          }
        }
      }
    }

    categories.clear();
    for (const [category, list] of mergedCategories.entries()) {
      categories.set(category, list);
    }

    subcategories.clear();
    for (const [category, subs] of mergedSubcategories.entries()) {
      subcategories.set(category, subs);
    }
  }

  _injectVirtualChannelCategory(commands, categories, subcategories) {
    const existing = [
      "channel","categorydelete","catdelete","delcategory","categorydel",
      "hide","unhide","unhideall","lock","unlock","unlockall","nuke","purge","purgebots"
    ];

    const actions = [
      ["create","Create a text, voice, announcement, forum, stage, or category channel.","channel create <name> [type] [category]"],
      ["delete","Delete a channel.","channel delete <channel>"],
      ["clone","Clone a channel.","channel clone <channel> [new-name]"],
      ["copy","Copy a channel (alias of clone).","channel copy <channel> [new-name]"],
      ["rename","Rename a channel.","channel rename <channel> <new-name>"],
      ["topic","Change a channel topic.","channel topic <channel> <topic>"],
      ["slowmode","Set channel slowmode.","channel slowmode <channel> <seconds>"],
      ["lock","Lock a channel for @everyone.","channel lock [channel]"],
      ["unlock","Unlock a channel for @everyone.","channel unlock [channel]"],
      ["hide","Hide a channel from @everyone.","channel hide [channel]"],
      ["show","Show a channel to @everyone.","channel show [channel]"],
      ["move","Move a channel into a category.","channel move <channel> <category>"],
      ["nsfw","Enable or disable NSFW.","channel nsfw <channel> <on|off>"],
      ["permission","Allow/deny a channel permission.","channel permission <channel> <@role|@user> <allow|deny> <permission>"],
      ["info","Show channel information.","channel info [channel]"],
      ["list","List server channels.","channel list"],
    ];

    const channelCommands = [];
    const seen = new Set();

    for (const command of commands.values()) {
      if (!command?.name) continue;
      const name = String(command.name).toLowerCase();
      if (!existing.includes(name) && name !== "channel") continue;
      if (seen.has(name)) continue;
      seen.add(name);
      channelCommands.push(command);
    }

    for (const [name, description, usage] of actions) {
      if (seen.has(name)) continue;
      const virtual = {
        name,
        displayName: name,
        description,
        usage,
        aliases: name === "copy" ? ["channel copy"] : [],
        category: "Channel",
        cooldown: 2,
        enabledSlash: false,
        virtual: true,
      };
      commands.set(name, virtual);
      channelCommands.push(virtual);
      seen.add(name);
    }

    categories.set("Channel", channelCommands);
    if (!subcategories.has("Channel")) subcategories.set("Channel", new Map());
  }

  _createMainContainer(commands, categories, subcategories) {
    try {
      const categoryArray = Array.from(new Set(Array.from(categories.keys()).map(category => {
        const key = String(category || "").toLowerCase();
        if (key === "channel") return "Channel";
        if (key === "music" || key === "rythmusic") return "Music";
        return category;
      })));
      const uniqueCommands = Array.from(commands.values()).filter(
        (cmd, index, arr) =>
          arr.findIndex((c) => c.name === cmd.name) === index,
      );

      const slashCommands = uniqueCommands.filter(
        (cmd) => cmd.enabledSlash === true && cmd.slashData,
      );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${emoji.get("aerox")} **LIGHTCORE • HELP CENTER**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `${emoji.get("reply4")} **${emoji.get("info")} Statistics**\n`;
      content += `${emoji.get("reply3")} Prefix Commands: ${uniqueCommands.length}\n`;
      content += `${emoji.get("reply3")} Slash Commands: ${slashCommands.length}\n`;
      content += `${emoji.get("reply")} Categories: ${categoryArray.length}\n`;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      content = `**Main Modules:**\n`;
      categoryArray.forEach((category) => {
        const emojiValue = this._getCategoryEmoji(category);
        const emojiString =
          typeof emojiValue === "object"
            ? `<:${category}:` + emojiValue.id + ">"
            : emojiValue;

        content += `> ${emojiString} \`»\` **[${this._capitalize(category)}](https://discord.gg/AeroX)**\n`;
      });

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (config.assets?.bannerUrl) {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            ...(config.assets?.bannerUrl ? [new MediaGalleryItemBuilder().setURL(config.assets.bannerUrl)] : []),
          ),
        );
      }

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (categoryArray.length === 0) {
        return this._createErrorContainer("No command categories available.");
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help_category_select")
        .setPlaceholder("Select a category")
        .addOptions(
          categoryArray.map((category) => {
            const categoryEmoji = this._getCategoryEmoji(category);
            return {
              label: this._displayCategory(category),
              value: category,
              emoji: categoryEmoji,
              description: `View ${this._capitalize(category)} commands`,
            };
          }),
        );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(selectMenu),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating main container:", error);
      return this._createErrorContainer("Unable to load help menu.");
    }
  }

  _createCategoryContainer(category, categories, subcategories) {
    try {
      const commands = categories.get(category) || [];
      const subcats = subcategories.get(category);

      if (commands.length === 0 && (!subcats || subcats.size === 0)) {
        return this._createErrorContainer(
          `No commands found in category "${category}".`,
        );
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **${this._capitalize(category)} Commands**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**${this._displayCategory(category)} Category**\n\n`;

      const directCommands = commands.filter((cmd) => {
        if (!subcats) return true;
        for (const [, subcatCommands] of subcats) {
          if (subcatCommands.find((subcmd) => subcmd.name === cmd.name)) {
            return false;
          }
        }
        return true;
      });

      const hasDirectCommands = directCommands.length > 0;
      const hasSubcats = subcats && subcats.size > 0;
      const subcatEntries = hasSubcats ? Array.from(subcats.entries()) : [];

      if (hasDirectCommands) {
        directCommands.forEach((cmd, index) => {
          const isLast = index === directCommands.length - 1 && !hasSubcats;
          const prefix = isLast ? "└── " : "├── ";
          content += `${prefix}${this._getCommandEmoji(cmd, category)} \`${cmd.displayName || cmd.name}\`\n`;
        });
      }

      if (hasSubcats) {
        subcatEntries.forEach(([subcatName], subcatIndex) => {
          const isLastSubcat = subcatIndex === subcatEntries.length - 1;
          const prefix = isLastSubcat ? "└── " : "├── ";
          content += `${prefix}${this._getCategoryEmoji(subcatName)} **${this._capitalize(subcatName)}**\n`;
        });
      }

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const selectOptions = [];

      if (hasDirectCommands) {
        directCommands.slice(0, 25).forEach((cmd) => {
          selectOptions.push({
            label: cmd.displayName || cmd.name,
            emoji: this._getCommandEmoji(cmd, category),
            value: `cmd_${cmd.name}`,
            description: cmd.description ? cmd.description.slice(0, 100) : "No description",
          });
        });
      }

      if (hasSubcats) {
        subcatEntries.forEach(([subcatName, subcatCommands]) => {
          if (selectOptions.length < 25) {
            selectOptions.push({
              label: this._capitalize(subcatName),
              emoji: this._getEmojiObject(`category_${subcatName.toLowerCase()}`),
              value: `subcat_${subcatName}`,
              description: `View ${this._capitalize(subcatName)} commands`,
            });
          }
        });
      }

      if (selectOptions.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`help_category_nav_${category}`)
          .setPlaceholder(`Select a folder or command`)
          .addOptions(selectOptions.slice(0, 25));

        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(selectMenu),
        );
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
      );

      container.addActionRowComponents(buttonRow);

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating category container:", error);
      return this._createErrorContainer("Unable to load category commands.");
    }
  }

  _createSubcategoryContainer(category, subcatName, subcategories, commands) {
    try {
      const subcats = subcategories.get(category);
      if (!subcats || !subcats.has(subcatName)) {
        return this._createErrorContainer(`Subcategory "${subcatName}" not found.`);
      }

      const subcatCommands = subcats.get(subcatName) || [];

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **${this._capitalize(subcatName)} Commands**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**${this._displayCategory(category)} > ${this._capitalize(subcatName)}**\n\n`;

      subcatCommands.forEach((cmd, index) => {
        const isLast = index === subcatCommands.length - 1;
        const prefix = isLast ? "└── " : "├── ";
        content += `${prefix}${this._getCommandEmoji(cmd, category)} \`${cmd.name}\`\n`;
      });

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (subcatCommands.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`help_subcat_cmd_${category}_${subcatName}`)
          .setPlaceholder(`Select a command for detailed info`)
          .addOptions(
            subcatCommands.slice(0, 25).map((cmd) => ({
              label: cmd.displayName || cmd.name,
              emoji: this._getCommandEmoji(cmd, category),
              value: cmd.name,
              description: cmd.description ? cmd.description.slice(0, 100) : "No description",
            })),
          );

        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(selectMenu),
        );
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`help_back_category_${category}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Home")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("help_close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
      );

      container.addActionRowComponents(buttonRow);

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating subcategory container:", error);
      return this._createErrorContainer("Unable to load subcategory commands.");
    }
  }

  _createCommandContainer(command, category) {
    try {
      if (!command) return this._createErrorContainer("Command not found.");

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Command: ${command.name}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**Command Information**\n\n`;
      content += `┌─ **${emoji.get("info")} Basic Info**\n`;
      content += `├─ Description: ${command.description || "No description provided"}\n`;
      const helpUsage = this._getHelpUsage(command);
      content += `├─ Usage: \`${helpUsage}\`\n`;
      content += `├─ Category: ${this._capitalize(command.category || "misc")}\n`;
      content += `└─ Cooldown: ${command.cooldown || 3}s\n\n`;

      if (command.aliases?.length) {
        content += `**Aliases:**\n`;
        command.aliases.forEach((a, i) => {
          const isLast = i === command.aliases.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} \`${a}\`\n`;
        });
        content += "\n";
      }

      if (command.examples?.length) {
        content += `**Examples:**\n`;
        command.examples.forEach((ex, i) => {
          const isLast = i === command.examples.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} \`${ex}\`\n`;
        });
        content += "\n";
      }

      const requirements = [];
      if (command.ownerOnly) requirements.push("Bot Owner");
      if (command.userPrem) requirements.push("User Premium");
      if (command.guildPrem) requirements.push("Server Premium");
      if (command.anyPrem) requirements.push("Any Premium (User or Server)");
      if (command.voiceRequired) requirements.push("Voice Channel");
      if (command.sameVoiceRequired) requirements.push("Same Voice Channel");
      if (command.playerRequired) requirements.push("Music Player");
      if (command.playingRequired) requirements.push("Currently Playing");
      if (command.maintenance) requirements.push("Maintenance Mode");
      if (command.userPermissions?.length)
        requirements.push(
          `User Permissions: ${command.userPermissions.join(", ")}`,
        );
      if (command.permissions?.length)
        requirements.push(`Bot Permissions: ${command.permissions.join(", ")}`);

      if (requirements.length) {
        content += `**Requirements:**\n`;
        requirements.forEach((req, i) => {
          const isLast = i === requirements.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} ${req}\n`;
        });
      }

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const buttons = [
        new ButtonBuilder()
          .setCustomId(
            `help_back_category_${category || command.category || "misc"}`,
          )
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Home")
          .setStyle(ButtonStyle.Primary),
      ];

      if (command.enabledSlash && command.slashData) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`help_slash_info_${command.name}`)
            .setLabel("Slash Info")
            .setStyle(ButtonStyle.Success),
        );
      }

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buttons),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating command container:", error);
      return this._createErrorContainer("Unable to load command information.");
    }
  }

  _createSlashInfoContainer(command, category) {
    try {
      if (!command?.slashData)
        return this._createErrorContainer(
          "Slash command information not available.",
        );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Slash Command: ${command.name}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const slashName = Array.isArray(command.slashData.name)
        ? `/${command.slashData.name.join(" ")}`
        : `/${command.slashData.name}`;

      let content = `**Slash Command Information**\n\n`;
      content += `┌─ **Command:** \`${slashName}\`\n`;
      content += `└─ **Description:** ${command.slashData.description}\n\n`;

      if (command.slashData.options?.length) {
        content += `**Options:**\n`;
        command.slashData.options.forEach((option, i) => {
          const required = option.required ? " (Required)" : " (Optional)";
          const isLast = i === command.slashData.options.length - 1;
          const prefix = isLast ? "└─" : "├─";
          const indent = isLast ? "   " : "│  ";
          content += `${prefix} \`${option.name}\`${required}: ${option.description}\n`;

          if (option.choices?.length) {
            option.choices.forEach((choice, ci) => {
              const isChoiceLast = ci === option.choices.length - 1;
              const choicePrefix = isChoiceLast ? `${indent}└─` : `${indent}├─`;
              content += `${choicePrefix} \`${choice.name}\`\n`;
            });
          }
        });
      }

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `help_back_command_${command.name}_${category || command.category || "misc"}`,
            )
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("help_back_main")
            .setLabel("Home")
            .setStyle(ButtonStyle.Primary),
        ),
      );

      return container;
    } catch (error) {
      logger.error(
        "HelpCommand",
        "Error creating slash info container:",
        error,
      );
      return this._createErrorContainer(
        "Unable to load slash command information.",
      );
    }
  }

  _createErrorContainer(message) {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const content = `**Something went wrong**\n\n┌─ **${emoji.get("info")} Issue:** ${message}\n└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n*Please check your input and try again*`;

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating error container:", error);
      const fallbackContainer = new ContainerBuilder();
      fallbackContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("cross")} **Error**\n*Help system unavailable*`,
        ),
      );
      return fallbackContainer;
    }
  }

  async _sendCommandHelp(
    messageOrInteraction,
    command,
    type,
    client,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const container = this._createCommandContainer(command, command.category);

      if (type === "message") {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.author.id,
          client,
          commands,
          categories,
          subcategories,
        );
      } else {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.user.id,
          client,
          commands,
          categories,
          subcategories,
        );
      }
    } catch (error) {
      logger.error("HelpCommand", "Error sending command help:", error);
    }
  }

  _setupCollector(
    message,
    userId,
    client,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const filter = (i) => i.user.id === userId;
      const collector = message.createMessageComponentCollector({
        filter,
        time: 300_000,
      });

      collector.on("collect", async (interaction) => {
        try {
          await interaction.deferUpdate();

          if (interaction.customId === "help_close") {
            await interaction.deleteReply().catch(() => {});
            collector.stop();
            return;
          }

          if (interaction.customId === "help_back_main") {
            await interaction.editReply({
              components: [
                this._createMainContainer(commands, categories, subcategories),
              ],
            });
            return;
          }

          if (interaction.customId === "help_category_select") {
            const category = interaction.values[0];
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_category_nav_")) {
            const category = interaction.customId.replace("help_category_nav_", "");
            const selectedValue = interaction.values[0];

            if (selectedValue.startsWith("cmd_")) {
              const commandName = selectedValue.replace("cmd_", "");
              const command = commands.get(commandName);
              if (command) {
                await interaction.editReply({
                  components: [this._createCommandContainer(command, category)],
                });
              }
            } else if (selectedValue.startsWith("subcat_")) {
              const subcatName = selectedValue.replace("subcat_", "");
              await interaction.editReply({
                components: [
                  this._createSubcategoryContainer(category, subcatName, subcategories, commands),
                ],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_subcat_cmd_")) {
            const parts = interaction.customId.replace("help_subcat_cmd_", "").split("_");
            const category = parts[0];
            const commandName = interaction.values[0];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category)],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_category_")) {
            const category = interaction.customId.replace(
              "help_back_category_",
              "",
            );
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_slash_info_")) {
            const commandName = interaction.customId.replace(
              "help_slash_info_",
              "",
            );
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [
                  this._createSlashInfoContainer(command, command.category),
                ],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_command_")) {
            const parts = interaction.customId
              .replace("help_back_command_", "")
              .split("_");
            const commandName = parts[0];
            const category = parts[1];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category)],
              });
            }
            return;
          }
        } catch (error) {
          client?.logger?.error(
            "HelpCommand",
            `Error in collector: ${error.message}`,
            error,
          );

          try {
            await interaction.followUp({
              content: "An error occurred while processing your request. Please try again.",
              ephemeral: true,
            });
          } catch (followUpError) {
            client?.logger?.error(
              "HelpCommand",
              `Error sending followup: ${followUpError.message}`,
            );
          }
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "limit" || reason === "messageDelete") return;

        try {
          const currentMessage = await this._fetchMessage(message).catch(
            () => null,
          );

          if (!currentMessage?.components?.length) {
            client?.logger?.debug(
              "HelpCommand",
              "No message or components found for disabling",
            );
            return;
          }

          const success = await this._disableAllComponents(
            currentMessage,
            client,
          );

          if (success) {
            client?.logger?.debug(
              "HelpCommand",
              `Components disabled successfully. Reason: ${reason}`,
            );
          }
        } catch (error) {
          this._handleDisableError(error, client, reason);
        }
      });

      collector.on("dispose", async (interaction) => {
        client?.logger?.debug(
          "HelpCommand",
          `Interaction disposed: ${interaction.customId}`,
        );
      });
    } catch (error) {
      logger.error("HelpCommand", "Error setting up collector:", error);
    }
  }

  async _disableAllComponents(message, client) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error) {
      client?.logger?.error(
        "HelpCommand",
        `Failed to disable components: ${error.message}`,
        error,
      );
      return false;
    }
  }

  _processComponents(components) {
    return components.map((component) => {
      if (component.type === ComponentType.ActionRow) {
        return {
          ...component.toJSON(),
          components: component.components.map((subComponent) => ({
            ...subComponent.toJSON(),
            disabled: true,
          })),
        };
      }

      if (component.type === ComponentType.Container) {
        return {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };
      }

      if (component.type === ComponentType.Section) {
        const processedComponent = {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };

        if (
          component.accessory &&
          component.accessory.type === ComponentType.Button
        ) {
          processedComponent.accessory = {
            ...component.accessory.toJSON(),
            disabled: true,
          };
        }

        return processedComponent;
      }

      return component.toJSON();
    });
  }

  _handleDisableError(error, client, reason) {
    if (error.code === 10008) {
      // Unknown Message
      client?.logger?.debug(
        "HelpCommand",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {
      // Missing Access
      client?.logger?.warn(
        "HelpCommand",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      client?.logger?.error(
        "HelpCommand",
        `Error disabling components: ${error.message}. Reason: ${reason}`,
        error,
      );
    }
  }

  async _fetchMessage(messageOrInteraction) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  _shouldDisableComponent(component) {
    const selectMenuTypes = [
      StringSelectMenuBuilder,
      UserSelectMenuBuilder,
      RoleSelectMenuBuilder,
      ChannelSelectMenuBuilder,
      MentionableSelectMenuBuilder,
    ];

    if (selectMenuTypes.some((type) => component instanceof type)) {
      return true;
    }

    if (component instanceof ButtonBuilder) {
      return component.data.style !== ButtonStyle.Link;
    }

    return false;
  }

  _capitalize(str) {
    try {
      if (!str || typeof str !== "string") {
        return "Unknown";
      }
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (error) {
      return "Unknown";
    }
  }

  _getHelpUsage(command) {
    const name = String(command?.name || "command");
    const configured = String(command?.usage || "").trim();
    if (configured && configured !== name) return "." + configured;

    const options = command?.options || command?.slashData?.options || [];
    const args = options
      .filter(option => option?.name && option.name !== "source")
      .map(option => option.required ? "<" + option.name + ">" : "[" + option.name + "]");
    const source = (command?.options || []).some(option => option?.name === "source")
      ? " [--source ytmsearch|ytsearch|spsearch|scsearch]"
      : "";
    return "." + name + (args.length ? " " + args.join(" ") : "") + source;
  }

  _getCommandEmojiKey(command, category) {
    const name = String(command?.name || "").toLowerCase();
    const cat = String(category || command?.category || "").toLowerCase();
    if (cat.includes("music") || cat.includes("rythm")) {
      const map = {
        play: "play", search: "search", nowplaying: "music", queue: "list", control: "settings",
        pause: "pause", resume: "play", skip: "skip", stop: "stop", disconnect: "stop",
        previous: "left", replay: "reload", seek: "forward", forward: "forward", rewind: "rewind",
        volume: "volume", shuffle: "shuffle", loop: "loop", queueloop: "loop", clear: "trash",
        remove: "trash", removedupes: "trash", move: "right", playtop: "play", playskip: "skip",
        bump: "right", autoplay: "reload", announce: "megaphone", join: "music",
        leavecleanup: "reset", like: "heart", liked: "heart", effects: "settings",
        forceskip: "skip", settings: "settings", "247": "infinity", setdefaultvolume: "volume",
        voteskip: "check", source: "music", history: "list", skipto: "skip"
      };
      return map[name] || "music";
    }
    return "info";
  }

  _getCommandEmoji(command, category) {
    const name = String(command?.name || "").toLowerCase();
    const cat = String(category || command?.category || "").toLowerCase();

    const maps = {
      channel: {
        channel: "channel", create: "add", delete: "trash", clone: "copy", copy: "copy",
        rename: "edit", topic: "edit", slowmode: "timer", lock: "lock", unlock: "unlock",
        hide: "hide", show: "unhide", move: "right", nsfw: "info", permission: "settings",
        info: "info", list: "list", categorydelete: "trash", catdelete: "trash",
        delcategory: "trash", categorydel: "trash", unhide: "unhide", unhideall: "unhide",
        unlockall: "unlock", nuke: "nuke", purge: "purge", purgebots: "moderation",
      },
      moderation: {
        ban: "ban", unban: "unban", kick: "kick", warn: "warn", mute: "mute",
        unmute: "unmute", purge: "purge", nuke: "nuke", lock: "lock", unlock: "unlock",
        timeout: "timer", untimeout: "reset", reason: "reason", duration: "duration",
      },
      ticket: { ticket: "ticket", ticketsetup: "ticketPanel", close: "ticketClose", claim: "ticketClaim" },
      voice: { tempvoice: "category_voice", voice: "category_voice", setup: "settings", claim: "owner" },
      pfps: { avatar: "avatar", banner: "banner", pfp: "pfp", gif: "gif", anime: "anime", girl: "girl", boy: "boy" },
      invites: { invite: "invite", invites: "invites", leaderboard: "leaderboard", rank: "trophy" },
      premium: { premium: "premium", premiumuser: "premium", premiumprofile: "premium" },
      owner: { owner: "owner", noprefix: "owner", reload: "reload", restart: "restart", backup: "backup" },
      logging: { logsetup: "info", logs: "info", showlogs: "info" },
      fun: { game: "game", dice: "dice", roll: "dice", heart: "heart", love: "heart" },
      utility: { settings: "settings", server: "server", role: "role", user: "user", nick: "nick", remind: "remind" },
      info: { help: "info", about: "info", ping: "status", stats: "total" },
    };

    if (cat.includes("music") || cat.includes("rythm")) {
      return emoji.get(this._getCommandEmojiKey(command, category)) || emoji.get("music") || "🎵";
    }

    const categoryMap = Object.keys(maps).find(key => cat.includes(key));
    const key = categoryMap ? (maps[categoryMap][name] || maps[categoryMap][name.split("-")[0]]) : null;
    if (key) return emoji.get(key) || emoji.get("info") || "ℹ️";

    // Meaningful fallback for any newly-added command/category.
    if (name.includes("ban")) return emoji.get("ban") || "🔨";
    if (name.includes("ticket")) return emoji.get("ticket") || "🎫";
    if (name.includes("role")) return emoji.get("role") || "🎭";
    if (name.includes("channel")) return emoji.get("channel") || "📺";
    if (name.includes("server") || name.includes("guild")) return emoji.get("server") || "🖥️";
    if (name.includes("user") || name.includes("member")) return emoji.get("user") || "👤";
    if (name.includes("invite")) return emoji.get("invite") || "📨";
    if (name.includes("avatar") || name.includes("pfp")) return emoji.get("avatar") || "🖼️";
    return this._getCategoryEmoji(category);
  }

  _getCategoryEmoji(category) {
    const key = String(category || "").toLowerCase();

    const direct = {
      channel: "channel",
      rythmusic: "category_music",
      music: "category_music",
      owner: "category_owner",
      premium: "category_premium",
      info: "category_info",
      utility: "category_utility",
      moderation: "category_moderation",
      logging: "category_logging",
      ticket: "category_ticket",
      pfps: "category_pfps",
      voice: "category_voice",
      invites: "category_invites",
      extra: "category_extra",
      fun: "category_fun",
      giveaway: "category_giveaway",
    };

    if (direct[key]) return emoji.get(direct[key]) || emoji.get("folder") || "📁";

    // Categories added later should still get a meaningful LightCore emoji.
    const keywordMap = [
      [["security", "antinuke", "automod"], "moderation"],
      [["music", "audio", "sound"], "music"],
      [["ticket", "support"], "ticket"],
      [["voice", "temp"], "category_voice"],
      [["invite"], "invites"],
      [["premium"], "premium"],
      [["owner", "developer", "dev"], "owner"],
      [["image", "avatar", "pfp", "profile"], "pfp"],
      [["game", "fun"], "fun"],
      [["giveaway"], "category_giveaway"],
      [["log", "audit"], "category_logging"],
      [["role"], "role"],
      [["server", "guild"], "server"],
      [["user", "member"], "user"],
      [["setting", "config", "utility"], "category_utility"],
    ];

    for (const [words, emojiKey] of keywordMap) {
      if (words.some(word => key.includes(word))) {
        return emoji.get(emojiKey) || emoji.get("folder") || "📁";
      }
    }

    // Deterministic pseudo-random fallback from the bot's existing emoji set.
    const fallbackKeys = ["folder", "sparkle", "game", "server", "role", "settings", "star", "badge"];
    let hash = 0;
    for (const char of key) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    const fallback = fallbackKeys[Math.abs(hash) % fallbackKeys.length];
    return emoji.get(fallback) || emoji.get("folder") || "📁";
  }

  _displayCategory(category) {
    const key = String(category || "").toLowerCase();
    if (key === "channel") return "Channel";
    if (key === "music" || key === "rythmusic") return "Music";
    return this._capitalize(category);
  }

  _getEmojiObject(name) {
    const emojiString = emoji.get(name);
    if (!emojiString) return undefined;
    
    const idMatch = emojiString.match(/:(\d+)>/);
    if (idMatch) {
      return { id: idMatch[1], animated: emojiString.startsWith("<a:") };
    }
    return emojiString || undefined;
  }
}

export default new HelpCommand();