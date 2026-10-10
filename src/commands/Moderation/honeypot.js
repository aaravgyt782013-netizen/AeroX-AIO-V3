import { ChannelType, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";

function resolveChannel(guild, raw) {
  if (!raw) return null;
  const id = String(raw).match(/^(?:<#)?(\d{15,25})>?$/)?.[1];
  if (id) return guild.channels.cache.get(id) || null;
  const name = String(raw).replace(/^#/, "").trim().toLowerCase();
  const matches = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name);
  return matches.size === 1 ? matches.first() : null;
}

export default {
  name: "honeypot",
  description: "Configure the LightCore honeypot security system.",
  usage: "honeypot setup #channel [ban|kick|timeout]",
  aliases: ["hpot", "trap"],
  category: "Moderation",
  cooldown: 5,
  userPermissions: [PermissionFlagsBits.ManageGuild],
  permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages],
  enabledSlash: true,
  slashData: {
    name: "honeypot",
    description: "Configure the LightCore honeypot security system.",
    options: [
      { name: "setup", description: "Enable the honeypot on a channel.", type: 1, options: [
        { name: "channel", description: "Trap text channel.", type: 7, required: true, channel_types: [0] },
        { name: "action", description: "Action for any account that posts in the honeypot channel.", type: 3, required: false, choices: [{name:"Ban",value:"ban"},{name:"Kick",value:"kick"},{name:"Timeout",value:"timeout"}] },
      ]},
      { name: "create", description: "Create a dedicated honeypot channel.", type: 1, options: [
        { name: "action", description: "Action for bot accounts.", type: 3, required: false, choices: [{name:"Ban",value:"ban"},{name:"Kick",value:"kick"},{name:"Timeout",value:"timeout"}] },
      ]},
      { name: "disable", description: "Disable the honeypot.", type: 1 },
      { name: "status", description: "Show honeypot status.", type: 1 },
      { name: "action", description: "Change the bot action.", type: 1, options: [{name:"value",description:"ban, kick or timeout",type:3,required:true,choices:[{name:"Ban",value:"ban"},{name:"Kick",value:"kick"},{name:"Timeout",value:"timeout"}]}] },
    ],
  },
  async execute({ message, args }) {
    const sub = (args[0] || "status").toLowerCase();
    const settings = db.guild.getHoneypotSettings(message.guild.id);
    if (sub === "status") {
      const ch = settings.channelId ? message.guild.channels.cache.get(settings.channelId) : null;
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle("🍯 LightCore Honeypot").setDescription(ch ? "Enabled in <#" + ch.id + ">\nAction for any account: **" + settings.action + "**" : "Disabled. Use honeypot setup #channel.").setTimestamp()] });
    }
    if (sub === "disable" || sub === "off") {
      db.guild.setHoneypot(message.guild.id, null, settings.action);
      return message.reply("🍯 Honeypot disabled.");
    }
    if (sub === "action") {
      const action = (args[1] || "").toLowerCase();
      if (!["ban","kick","timeout"].includes(action)) return message.reply("❌ Action must be ban, kick, or timeout.");
      db.guild.setHoneypotAction(message.guild.id, action);
      return message.reply("🍯 Honeypot action set to **" + action + "**.");
    }
    if (sub === "create") {
      const action = ["ban","kick","timeout"].includes((args[1] || "").toLowerCase()) ? args[1].toLowerCase() : settings.action;
      const existing = message.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === "🍯・honeypot");
      const channel = existing || await message.guild.channels.create({ name: "🍯・honeypot", type: ChannelType.GuildText, topic: "LightCore security honeypot. Do not use this channel.", reason: "LightCore honeypot setup" });
      db.guild.setHoneypot(message.guild.id, channel.id, action);
      return message.reply("🍯 Honeypot enabled in <#" + channel.id + "> with **" + action + "** for bot accounts.");
    }
    if (sub === "setup") {
      const channel = resolveChannel(message.guild, args[1]);
      if (!channel) return message.reply("❌ Use honeypot setup #channel [ban|kick|timeout].");
      const action = ["ban","kick","timeout"].includes((args[2] || "").toLowerCase()) ? args[2].toLowerCase() : settings.action;
      db.guild.setHoneypot(message.guild.id, channel.id, action);
      return message.reply("🍯 Honeypot enabled in <#" + channel.id + "> for any account: **" + action + "**.");
    }
    return message.reply("❌ Use honeypot setup, create, disable, status, or action.");
  },
  async slashExecute({ interaction }) {
    const sub = interaction.options.getSubcommand();
    const settings = db.guild.getHoneypotSettings(interaction.guild.id);
    if (sub === "status") return interaction.reply({ content: settings.channelId ? "🍯 Honeypot enabled in <#" + settings.channelId + "> with " + settings.action + "." : "🍯 Honeypot disabled.", ephemeral: true });
    if (sub === "disable") { db.guild.setHoneypot(interaction.guild.id, null, settings.action); return interaction.reply({content:"🍯 Honeypot disabled.",ephemeral:true}); }
    if (sub === "action") { const action=interaction.options.getString("value",true); db.guild.setHoneypotAction(interaction.guild.id,action); return interaction.reply({content:"🍯 Honeypot action set to " + action + ".",ephemeral:true}); }
    if (sub === "setup") { const ch=interaction.options.getChannel("channel",true); const action=interaction.options.getString("action") || settings.action; db.guild.setHoneypot(interaction.guild.id,ch.id,action); return interaction.reply({content:"🍯 Honeypot enabled in <#" + ch.id + "> for any account: " + action + ".",ephemeral:true}); }
    if (sub === "create") { const action=interaction.options.getString("action") || settings.action; const existing=interaction.guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name==="🍯・honeypot"); const ch=existing || await interaction.guild.channels.create({name:"🍯・honeypot",type:ChannelType.GuildText,topic:"LightCore security honeypot. Do not use this channel.",reason:"LightCore honeypot setup"}); db.guild.setHoneypot(interaction.guild.id,ch.id,action); return interaction.reply({content:"🍯 Honeypot enabled in <#" + ch.id + "> with " + action + ".",ephemeral:true}); }
  },
};
