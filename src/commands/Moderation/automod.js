import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";

const TOGGLES = [
  ["enabled", "AutoMod", "🛡️"],
  ["block_links", "Anti Links", "🔗"],
  ["block_invites", "Anti Invites", "📨"],
  ["anti_caps", "Anti Caps", "🔠"],
  ["block_nsfw_links", "NSFW Links", "🔞"],
];
const isOn = value => value === 1 || value === true;
function panel(guild, settings) {
  const embed = new EmbedBuilder().setColor(isOn(settings.enabled) ? 0x57F287 : 0xED4245)
    .setTitle("🛡️ " + guild.name + " — AutoMod Control Panel")
    .setDescription("Use the buttons and menus below to configure AutoMod. Settings are saved per server.")
    .addFields(
      { name: "Protection", value: TOGGLES.map(([key, label, icon]) => (isOn(settings[key]) ? "🟢" : "🔴") + " " + icon + " **" + label + "**").join("\n"), inline: true },
      { name: "Thresholds", value: "**Spam:** " + settings.spam_limit + " messages / 6s\n**Mentions:** " + settings.mention_limit + "\n**Emoji limit:** " + (settings.emoji_limit || 12), inline: true },
      { name: "Filtered phrases", value: String((() => { try { return JSON.parse(settings.bad_words || "[]").length; } catch { return 0; } })()) },
      { name: "Mod log", value: settings.log_channel ? "<#" + settings.log_channel + ">" : "Not configured" }
    ).setFooter({ text: "Only server managers can use this panel." });

  const toggles = new ActionRowBuilder().addComponents(TOGGLES.slice(0, 4).map(([key, label]) =>
    new ButtonBuilder().setCustomId("automod_toggle:" + key).setLabel(label).setStyle(isOn(settings[key]) ? ButtonStyle.Success : ButtonStyle.Secondary)
  ));
  const toggles2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("automod_toggle:block_nsfw_links").setLabel("NSFW Links").setStyle(isOn(settings.block_nsfw_links) ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("automod_toggle:block_links").setLabel("Links").setStyle(isOn(settings.block_links) ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("automod_toggle:block_invites").setLabel("Invites").setStyle(isOn(settings.block_invites) ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("automod_refresh").setLabel("Refresh").setStyle(ButtonStyle.Primary)
  );
  const threshold = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("automod_threshold").setPlaceholder("Configure spam / mentions / emoji thresholds").addOptions([
      { label: "Spam: 3 messages / 6 sec", value: "spam:3" }, { label: "Spam: 5 messages / 6 sec", value: "spam:5" }, { label: "Spam: 8 messages / 6 sec", value: "spam:8" }, { label: "Spam: 10 messages / 6 sec", value: "spam:10" },
      { label: "Mentions: 3", value: "mentions:3" }, { label: "Mentions: 5", value: "mentions:5" }, { label: "Mentions: 8", value: "mentions:8" },
      { label: "Emoji limit: 8", value: "emoji:8" }, { label: "Emoji limit: 12", value: "emoji:12" }, { label: "Emoji limit: 20", value: "emoji:20" }
    ])
  );
  return { embeds: [embed], components: [toggles, toggles2, threshold] };
}

export default {
  name: "automod",
  description: "Interactive automatic moderation setup and configuration panel.",
  usage: "automod <panel|on|off|status|spam|mentions|links|invites|caps|nsfw|emoji|log|wordadd|wordremove>",
  aliases: ["auto-mod", "am"],
  category: "Moderation",
  cooldown: 3,
  userPermissions: [PermissionFlagsBits.ManageGuild],
  permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages],
  enabledSlash: false,
  async execute({ message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const guildId = message.guild.id;
    const action = (args.shift() || "panel").toLowerCase();
    const current = db.getAutoMod(guildId);
    const words = (() => { try { return JSON.parse(current.bad_words || "[]"); } catch { return []; } })();
    if (["panel", "config", "status"].includes(action)) {
      const sent = await message.reply(panel(message.guild, current));
      const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
      collector.on("collect", async interaction => {
        if (interaction.user.id !== message.author.id && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "Only the command user or a server manager can configure this panel.", ephemeral: true });
        }
        try {
          if (interaction.customId.startsWith("automod_toggle:")) {
            const key = interaction.customId.split(":")[1];
            db.setAutoMod(guildId, key, isOn(db.getAutoMod(guildId)[key]) ? 0 : 1);
          } else if (interaction.customId === "automod_threshold") {
            const [kind, raw] = interaction.values[0].split(":");
            const key = kind === "spam" ? "spam_limit" : kind === "mentions" ? "mention_limit" : "emoji_limit";
            db.setAutoMod(guildId, key, Number(raw));
          }
          await interaction.update(panel(message.guild, db.getAutoMod(guildId)));
        } catch (error) {
          await interaction.reply({ content: "Could not save this setting: " + (error?.message || "database error"), ephemeral: true }).catch(() => {});
        }
      });
      collector.on("end", () => sent.edit({ components: [] }).catch(() => {}));
      return;
    }
    if (action === "on" || action === "enable") db.setAutoMod(guildId, "enabled", 1);
    else if (action === "off" || action === "disable") db.setAutoMod(guildId, "enabled", 0);
    else if (action === "spam" || action === "mentions" || action === "emoji") {
      const n = Number(args[0]);
      const limits = action === "spam" ? [3, 15] : action === "mentions" ? [2, 15] : [3, 50];
      if (!Number.isInteger(n) || n < limits[0] || n > limits[1]) return message.reply("Invalid threshold. Allowed range: " + limits.join("–") + ".");
      db.setAutoMod(guildId, action === "spam" ? "spam_limit" : action === "mentions" ? "mention_limit" : "emoji_limit", n);
    } else if (["links", "invites", "caps", "nsfw"].includes(action)) {
      const value = (args[0] || "").toLowerCase();
      if (!["on", "off"].includes(value)) return message.reply("Use automod " + action + " on/off.");
      const key = { links: "block_links", invites: "block_invites", caps: "anti_caps", nsfw: "block_nsfw_links" }[action];
      db.setAutoMod(guildId, key, value === "on" ? 1 : 0);
    } else if (action === "log") {
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]?.replace(/[<#>]/g, ""));
      if (!channel?.isTextBased?.()) return message.reply("Use automod log #channel.");
      db.setAutoMod(guildId, "log_channel", channel.id);
    } else if (action === "wordadd") {
      const word = args.join(" ").trim().toLowerCase();
      if (!word || word.length > 60) return message.reply("Use automod wordadd <word or phrase> (max 60 characters).");
      if (!words.includes(word)) words.push(word);
      db.setAutoMod(guildId, "bad_words", JSON.stringify(words.slice(0, 100)));
    } else if (action === "wordremove") {
      const word = args.join(" ").trim().toLowerCase();
      if (!word) return message.reply("Use automod wordremove <word or phrase>.");
      db.setAutoMod(guildId, "bad_words", JSON.stringify(words.filter(w => w !== word)));
    } else return message.reply("Use `automod` for the interactive panel, or `automod on/off`, `automod log #channel`, `automod wordadd <phrase>`.");
    return message.reply("✅ AutoMod setting saved. Run `automod` to open the updated panel.");
  }
};
