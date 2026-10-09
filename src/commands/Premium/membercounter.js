import { Command } from "#structures/classes/Command";
import { ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { memberStats } from "#managers/MemberStatsManager";

const METRICS = {
  members: "👥 Members", humans: "👤 Humans", bots: "🤖 Bots",
  channels: "🗂️ Channels", roles: "🎭 Roles", boosts: "🚀 Boosts",
};
const METRIC_CHOICES = Object.keys(METRICS).map(name => ({ name: METRICS[name], value: name }));
function premiumType(client, userId, guildId) {
  const user = client.db.isUserPremium(userId);
  const guild = client.db.isGuildPremium(guildId);
  return { user: Boolean(user), guild: Boolean(guild), max: guild ? 10 : 3 };
}

class MemberCounterCommand extends Command {
  constructor() {
    super({
      name: "membercounter",
      description: "Create and manage Premium live server counters",
      usage: "membercounter <setup|list|remove> [metric|channel]",
      aliases: ["mcounter", "statscounter"],
      category: "Premium",
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "membercounter",
        description: "Create and manage Premium live server counters",
        options: [
          { type: 3, name: "action", description: "What to do", required: true,
            choices: [{ name: "setup", value: "setup" }, { name: "list", value: "list" }, { name: "remove", value: "remove" }] },
          { type: 3, name: "metric", description: "Statistic to display for setup", required: false, choices: METRIC_CHOICES },
          { type: 3, name: "label", description: "Optional short counter label", required: false },
          { type: 3, name: "channel", description: "Channel ID to remove", required: false },
        ],
      },
    });
  }

  async execute({ client, message, args }) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    return this.runAction(client, message.guild, message.member, message.author.id,
      (args[0] || "list").toLowerCase(), args[1], args.slice(2).join(" "), message, args[1]);
  }

  async slashExecute({ client, interaction }) {
    if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return this.runAction(client, interaction.guild, { permissions: { has: permission => interaction.memberPermissions?.has(permission) || false } }, interaction.user.id,
      interaction.options.getString("action"), interaction.options.getString("metric"),
      interaction.options.getString("label") || "", interaction, interaction.options.getString("channel"));
  }

  async runAction(client, guild, member, userId, action, metric, label, responder, channelId) {
    const premium = premiumType(client, userId, guild.id);
    const isSlash = typeof responder.isChatInputCommand === "function" && responder.isChatInputCommand();
    const reply = payload => responder.reply(payload);
    if (!premium.user && !premium.guild) {
      return reply({ content: "⭐ Member counters require LightCore User Premium or Guild Premium.", ephemeral: isSlash });
    }
    if (!member.permissions?.has(PermissionFlagsBits.ManageGuild) && !member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return reply({ content: "You need Manage Server to configure member counters.", ephemeral: isSlash });
    }

    if (action === "list") {
      const counters = memberStats.getCounters(guild.id);
      const text = counters.length
        ? counters.map(c => "• <#" + c.channel_id + "> — **" + c.label + "** (" + c.metric + ")").join("\n")
        : "No counters yet. Run membercounter setup members to create one.";
      return reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("📊 LightCore Live Counters").setDescription(text)] });
    }

    if (action === "remove") {
      const id = channelId || String(metric || "").replace(/[<#>]/g, "");
      if (!id) return reply({ content: "Provide the counter channel ID in the channel option, or use membercounter remove <channel-id>.", ephemeral: isSlash });
      const counter = memberStats.getCounters(guild.id).find(item => item.channel_id === id);
      if (!counter) return reply({ content: "I couldn't find that counter in this server.", ephemeral: isSlash });
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (channel) await channel.delete("Removed LightCore member counter").catch(() => null);
      memberStats.removeCounter(id, guild.id);
      return reply({ content: "✅ Counter removed." });
    }

    if (action !== "setup") {
      return reply({ content: "Use membercounter setup <members|humans|bots|channels|roles|boosts> [label], membercounter list, or membercounter remove <channel-id>.", ephemeral: isSlash });
    }
    if (!METRICS[metric]) {
      return reply({ content: "Choose a metric: " + Object.keys(METRICS).join(", ") + ".", ephemeral: isSlash });
    }
    const existing = memberStats.getCounters(guild.id);
    if (existing.length >= premium.max) {
      return reply({ content: "Your current Premium tier allows up to " + premium.max + " counters in this server. Guild Premium unlocks up to 10 counters.", ephemeral: isSlash });
    }
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return reply({ content: "I need Manage Channels permission to create and update counters.", ephemeral: isSlash });
    }

    const defaultLabel = METRICS[metric].replace(/^[^ ]+ /, "");
    const safeLabel = (label || defaultLabel).trim().slice(0, 70);
    const value = await memberStats.metricValue(guild, metric);
    try {
      const channel = await guild.channels.create({
        name: (safeLabel + ": " + Number(value).toLocaleString("en-US")).slice(0, 100),
        type: ChannelType.GuildVoice,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
        reason: "LightCore Premium member counter created by " + userId,
      });
      memberStats.addCounter({ channelId: channel.id, guildId: guild.id, metric, label: safeLabel, userId });
      return reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle("✅ Counter Created").setDescription("Created " + channel + " for **" + safeLabel + "**. It refreshes when members join or leave.") ] });
    } catch (error) {
      return reply({ content: "Couldn't create the counter. Check my Manage Channels permission. (" + (error?.message || "unknown error") + ")", ephemeral: isSlash });
    }
  }
}
export default new MemberCounterCommand();
