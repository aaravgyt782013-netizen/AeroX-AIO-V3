import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from "discord.js";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";

const PAGE_SIZE = 20;
const CATEGORY_PAGE_SIZE = 20;

const uniqCommands = (client) => {
  const map = new Map();
  const registered = client?.commandHandler?.commands;
  if (registered?.values) {
    for (const command of registered.values()) {
      if (!command?.name) continue;
      if (!map.has(command.name)) map.set(command.name, command);
    }
  }
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

const canonicalCategory = (value) => {
  const key = String(value || "Misc").trim().toLowerCase();
  if (key === "rythmmusic" || key === "music") return "Music";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Misc";
};

const encode = value => encodeURIComponent(String(value));
const decode = value => {
  try { return decodeURIComponent(value); } catch { return value; }
};

class HelpCommand extends Command {
  constructor() {
    super({
      name: "help",
      description: "Shows every available LightCore command and its usage",
      usage: "help [command]",
      aliases: ["h", "commands"],
      category: "info",
      examples: ["help", "help play", "help music", "h skip"],
      cooldown: 3,
      enabledSlash: true,
      slashData: {
        name: "help",
        description: "Browse every LightCore command",
        options: [{
          name: "command",
          description: "Specific command to get help for",
          type: 3,
          required: false,
          autocomplete: true,
        }],
      },
    });
  }

  _catalog(client) {
    const commands = uniqCommands(client);
    const categories = new Map();

    for (const command of commands) {
      const category = canonicalCategory(command.category);
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category).push(command);
    }

    for (const list of categories.values()) {
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return { commands, categories };
  }

  async execute({ client, message, args }) {
    return this._run({ client, source: message, args, userId: message.author.id, slash: false });
  }

  async slashExecute({ client, interaction }) {
    const commandName = interaction.options.getString("command");
    if (commandName) {
      const { commands } = this._catalog(client);
      const command = commands.find(c => c.name.toLowerCase() === commandName.toLowerCase());
      if (!command) {
        return interaction.reply(this._payload(this._error(`Command "${commandName}" not found.`), true));
      }
      const reply = await interaction.reply(this._payload(this._command(command), false, true));
      this._collector(reply, interaction.user.id, client);
      return reply;
    }
    return this._run({ client, source: interaction, args: [], userId: interaction.user.id, slash: true });
  }

  async _run({ client, source, args, userId, slash }) {
    try {
      const { commands } = this._catalog(client);
      if (args?.length) {
        const command = commands.find(c =>
          c.name.toLowerCase() === String(args[0]).toLowerCase() ||
          (c.aliases || []).some(a => String(a).toLowerCase() === String(args[0]).toLowerCase())
        );
        if (!command) {
          const payload = this._payload(this._error(`Command "${args[0]}" not found. Try .help to browse all commands.`));
          return slash ? source.reply(payload) : source.reply(payload);
        }
        const payload = this._payload(this._command(command));
        if (slash) {
          const reply = await source.reply({ ...payload, fetchReply: true });
          this._collector(reply, userId, client);
          return reply;
        }
        const reply = await source.reply(payload);
        this._collector(reply, userId, client);
        return reply;
      }

      const payload = this._payload(this._home(client));
      if (slash) {
        const reply = await source.reply({ ...payload, fetchReply: true });
        this._collector(reply, userId, client);
        return reply;
      }
      const reply = await source.reply(payload);
      this._collector(reply, userId, client);
      return reply;
    } catch (error) {
      logger.error("HelpCommand", "Help failed", error);
      const payload = this._payload(this._error("The help menu could not be loaded. Please try .help again."));
      if (slash) {
        if (source.replied || source.deferred) return source.editReply(payload);
        return source.reply(payload);
      }
      return source.reply(payload);
    }
  }

  _payload(container, ephemeral = false, fetchReply = false) {
    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
      ...(fetchReply ? { fetchReply: true } : {}),
    };
  }

  _home(client, page = 0) {
    const { commands, categories } = this._catalog(client);
    const names = [...categories.keys()].sort((a, b) => a.localeCompare(b));
    const pages = Math.max(1, Math.ceil(names.length / CATEGORY_PAGE_SIZE));
    const current = Math.max(0, Math.min(Number(page) || 0, pages - 1));
    const visible = names.slice(current * CATEGORY_PAGE_SIZE, (current + 1) * CATEGORY_PAGE_SIZE);
    const totalSlash = commands.filter(c => c.enabledSlash && c.slashData).length;

    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${emoji.get("aerox", "🎵")} **LIGHTCORE • HELP CENTER**`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Command Directory**\n├─ Prefix commands: **${commands.length}**\n├─ Slash-capable commands: **${totalSlash}**\n├─ Categories: **${names.length}**\n└─ Every loaded command is listed below and can be opened for full usage/options.`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    let body = `**Modules • Page ${current + 1}/${pages}**\n\n`;
    for (let i = 0; i < visible.length; i++) {
      const category = visible[i];
      body += `├─ ${this._categoryEmoji(category)} **${category}** — ${categories.get(category).length} commands\n`;
    }
    if (!visible.length) body += "No command categories are loaded.";
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (visible.length) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`help_category_${current}`)
          .setPlaceholder("Select a category")
          .addOptions(visible.map(category => ({
            label: category,
            value: encode(category),
            emoji: this._emojiObject(this._categoryEmoji(category)),
            description: `${categories.get(category).length} command(s)`,
          })))
      ));
    }

    const buttons = [];
    if (current > 0) buttons.push(new ButtonBuilder().setCustomId(`help_home_prev_${current}`).setLabel("Previous").setStyle(ButtonStyle.Secondary));
    if (current < pages - 1) buttons.push(new ButtonBuilder().setCustomId(`help_home_next_${current}`).setLabel("Next").setStyle(ButtonStyle.Primary));
    buttons.push(new ButtonBuilder().setCustomId("help_close").setLabel("Close").setStyle(ButtonStyle.Danger));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
    return container;
  }

  _category(client, category, page = 0) {
    const { categories } = this._catalog(client);
    const name = canonicalCategory(category);
    const list = categories.get(name) || [];
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const current = Math.max(0, Math.min(Number(page) || 0, pages - 1));
    const visible = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${this._categoryEmoji(name)} **${name} COMMANDS**`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    let body = `**${list.length} command(s) • Page ${current + 1}/${pages}**\n\n`;
    visible.forEach((command, index) => {
      const last = index === visible.length - 1;
      body += `${last ? "└" : "├"}─ ${this._commandEmoji(command, name)} \`${command.name}\` — ${String(command.description || "No description").slice(0, 100)}\n`;
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body || "No commands found."));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (visible.length) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`help_command_${encode(name)}_${current}`)
          .setPlaceholder("Select a command for full details")
          .addOptions(visible.map(command => ({
            label: String(command.name).slice(0, 100),
            value: encode(command.name),
            emoji: this._emojiObject(this._commandEmoji(command, name)),
            description: String(command.description || "No description").slice(0, 100),
          })))
      ));
    }

    const buttons = [];
    buttons.push(new ButtonBuilder().setCustomId(`help_back_home_${current}`).setLabel("Home").setStyle(ButtonStyle.Primary));
    if (current > 0) buttons.push(new ButtonBuilder().setCustomId(`help_category_prev_${encode(name)}_${current}`).setLabel("Previous").setStyle(ButtonStyle.Secondary));
    if (current < pages - 1) buttons.push(new ButtonBuilder().setCustomId(`help_category_next_${encode(name)}_${current}`).setLabel("Next").setStyle(ButtonStyle.Primary));
    buttons.push(new ButtonBuilder().setCustomId("help_close").setLabel("Close").setStyle(ButtonStyle.Danger));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
    return container;
  }

  _command(command) {
    const category = canonicalCategory(command.category);
    const prefixUsage = this._usage(command);
    const slash = command.enabledSlash && command.slashData ? `/${command.slashData.name || command.name}` : "Not registered";
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${this._commandEmoji(command, category)} **${command.name}**`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    let body = `**Command Information**\n\n├─ Description: ${command.description || "No description"}\n├─ Category: **${category}**\n├─ Prefix usage: \`${prefixUsage}\`\n├─ Slash usage: \`${slash}\`\n├─ Cooldown: **${command.cooldown || 3}s**`;
    if (command.voiceRequired) body += "\n├─ Requirement: Voice channel";
    if (command.sameVoiceRequired) body += "\n├─ Requirement: Same voice channel";
    if (command.ownerOnly) body += "\n├─ Requirement: Bot owner";
    if (command.userPermissions?.length) body += `\n├─ User permissions: ${command.userPermissions.join(", ")}`;
    if (command.permissions?.length) body += `\n├─ Bot permissions: ${command.permissions.join(", ")}`;

    if (command.aliases?.length) {
      body += `\n\n**Aliases:** ${command.aliases.map(a => "\`" + a + "\`").join(", ")}`;
    }
    if (command.examples?.length) {
      body += `\n\n**Examples:**\n${command.examples.map((e, i) => `${i === command.examples.length - 1 ? "└" : "├"}─ \`${e}\``).join("\n")}`;
    }

    const options = command.slashData?.options || [];
    if (options.length) {
      body += "\n\n**Slash options:**";
      for (const option of options.slice(0, 12)) {
        const required = option.required ? "Required" : "Optional";
        body += `\n├─ \`${option.name}\` — ${required}: ${String(option.description || "").slice(0, 100)}`;
        if (option.choices?.length) {
          body += ` (${option.choices.slice(0, 8).map(c => c.name).join(", ")})`;
        }
      }
      if (options.length > 12) body += `\n└─ +${options.length - 12} more option(s)`;
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body.slice(0, 3900)));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`help_back_category_${encode(category)}`).setLabel("Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("help_back_home").setLabel("Home").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("help_close").setLabel("Close").setStyle(ButtonStyle.Danger),
    ));
    return container;
  }

  _usage(command) {
    if (command.usage && command.usage !== command.name) return "." + command.usage;
    const options = command.options || command.slashData?.options || [];
    const args = options
      .filter(o => o?.name)
      .map(o => o.required ? `<${o.name}>` : `[${o.name}]`);
    return "." + command.name + (args.length ? " " + args.join(" ") : "");
  }

  _categoryEmoji(category) {
    const key = String(category || "").toLowerCase();
    const map = {
      music: "🎵", moderation: "🛡️", utility: "🛠️", info: "ℹ️", owner: "👑",
      ticket: "🎫", voice: "🔊", logging: "📋", pfps: "🖼️", invites: "📨",
      premium: "💎", fun: "🎮", giveaway: "🎉", extra: "✨", channel: "📺"
    };
    return map[key] || "📁";
  }

  _commandEmoji(command, category) {
    const name = String(command?.name || "").toLowerCase();
    if (String(category).toLowerCase() === "music") {
      const map = {
        play:"▶️", search:"🔎", queue:"📜", nowplaying:"🎵", pause:"⏸️", resume:"▶️",
        skip:"⏭️", previous:"⏮️", stop:"⏹️", volume:"🔊", shuffle:"🔀", loop:"🔁",
        autoplay:"🔄", settings:"⚙️", "247":"♾️", effects:"🎚️", history:"🕘"
      };
      return map[name] || "🎵";
    }
    if (name.includes("ban")) return "🔨";
    if (name.includes("ticket")) return "🎫";
    if (name.includes("role")) return "🎭";
    if (name.includes("channel")) return "📺";
    if (name.includes("server")) return "🖥️";
    if (name.includes("invite")) return "📨";
    return this._categoryEmoji(category);
  }

  _emojiObject(value) {
    return typeof value === "string" && /^<a?:/.test(value) ? undefined : value;
  }

  _error(message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("❌ **Help Error**"));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(message)));
    return container;
  }

  _collector(message, userId, client) {
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === userId,
      time: 300_000,
    });

    collector.on("collect", async interaction => {
      try {
        const id = interaction.customId;

        if (id === "help_close") {
          await interaction.update({ components: [this._error("Help closed. Run .help again whenever you need the command directory.")], flags: MessageFlags.IsComponentsV2 });
          collector.stop();
          return;
        }

        if (id.startsWith("help_home_prev_") || id.startsWith("help_home_next_")) {
          const page = Number(id.split("_").pop()) + (id.includes("_prev_") ? -1 : 1);
          return interaction.update({ components: [this._home(client, page)] });
        }

        if (id === "help_back_home" || id.startsWith("help_back_home_")) {
          return interaction.update({ components: [this._home(client, 0)] });
        }

        if (id === "help_category_select" || id.startsWith("help_category_")) {
          if (interaction.isStringSelectMenu()) {
            const category = decode(interaction.values[0]);
            return interaction.update({ components: [this._category(client, category, 0)] });
          }
          if (id.startsWith("help_category_prev_") || id.startsWith("help_category_next_")) {
            const parts = id.split("_");
            const direction = parts[2];
            const page = Number(parts.pop()) + (direction === "prev" ? -1 : 1);
            const category = decode(parts.slice(3).join("_"));
            return interaction.update({ components: [this._category(client, category, page)] });
          }
        }

        if (id.startsWith("help_command_") && interaction.isStringSelectMenu()) {
          const parts = id.split("_");
          const category = decode(parts[2]);
          const commandName = decode(interaction.values[0]);
          const { commands } = this._catalog(client);
          const command = commands.find(c => c.name === commandName);
          if (command) return interaction.update({ components: [this._command(command)] });
        }

        if (id.startsWith("help_back_category_")) {
          const category = decode(id.replace("help_back_category_", ""));
          return interaction.update({ components: [this._category(client, category, 0)] });
        }
      } catch (error) {
        client?.logger?.error?.("HelpCommand", "Help interaction failed", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Help interaction failed. Run .help again.", ephemeral: true }).catch(() => {});
        }
      }
    });

    collector.on("end", () => {});
  }

  async autocomplete({ interaction, client }) {
    try {
      const { commands } = this._catalog(client);
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = commands
        .filter(command => command.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(command => ({ name: command.name, value: command.name }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]).catch(() => {});
    }
  }
}

export default new HelpCommand();
