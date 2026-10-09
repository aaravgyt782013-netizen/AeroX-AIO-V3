import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";

class PremiumListCommand extends Command {
  constructor() {
    super({
      name: "premiumlist",
      description: "Interactive directory of Premium members and servers",
      usage: "premiumlist [servers|members]",
      aliases: ["premiumdirectory", "premiumguilds", "premiumusers"],
      category: "Owner",
      examples: ["premiumlist", "premiumlist servers", "premiumlist members"],
      cooldown: 0,
      ownerOnly: true,
    });
  }

  async execute({ client, message, args }) {
    if (!config.ownerIds?.includes(message.author.id)) {
      return message.reply({ content: `${emoji.get("cross")} This command is only available to bot owners.` });
    }

    let type = ["members", "users"].includes((args[0] || "").toLowerCase()) ? "members" : "servers";
    let page = 0;
    const perPage = 5;
    let closed = false;

    const getRecords = () => type === "servers"
      ? client.db.premium.getAllGuildPremiums()
      : client.db.premium.getAllUserPremiums();

    const expiry = (record) => record.expires_at == null
      ? "♾️ Lifetime"
      : `<t:${Math.floor(record.expires_at / 1000)}:R> ( <t:${Math.floor(record.expires_at / 1000)}:d> )`;

    const build = async () => {
      const records = getRecords();
      const maxPages = Math.max(1, Math.ceil(records.length / perPage));
      page = Math.max(0, Math.min(page, maxPages - 1));
      const current = records.slice(page * perPage, (page + 1) * perPage);
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${emoji.get("premium")} **LightCore Premium Directory**\n-# Owner control panel • Active Premium records only`
      ));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Active Premium Servers:** ${client.db.premium.getStats().active.guilds}\n` +
        `**Active Premium Members:** ${client.db.premium.getStats().active.users}\n` +
        `**Viewing:** ${type === "servers" ? "Premium Servers" : "Premium Members"} • Page ${page + 1}/${maxPages}`
      ));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      if (!current.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `No active Premium ${type === "servers" ? "servers" : "members"} found.`
        ));
      } else {
        const lines = [];
        for (let i = 0; i < current.length; i++) {
          const record = current[i];
          const number = page * perPage + i + 1;
          if (type === "servers") {
            const guildId = record.guild_id;
            const guild = client.guilds.cache.get(guildId);
            const name = guild?.name || "Server not in bot cache";
            const memberCount = guild?.memberCount == null ? "Unknown" : guild.memberCount.toLocaleString();
            let inviteUrl = null;
            if (guild) {
              try {
                const me = guild.members.me;
                const channel = guild.channels.cache.find((ch) =>
                  ch.type === ChannelType.GuildText &&
                  me &&
                  ch.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite)
                );
                if (channel) {
                  const invite = await channel.createInvite({
                    maxAge: 86400,
                    maxUses: 1,
                    reason: `Premium directory invite requested by bot owner ${message.author.id}`,
                  });
                  inviteUrl = invite.url;
                }
              } catch {}
            }
            lines.push(
              `**${number}. ${name}** ${guild ? "" : "• Not currently joined"}\n` +
              `└ ID: \`${guildId}\` • Members: ${memberCount}\n` +
              `└ Status: ${record.expires_at == null ? "Lifetime" : `Expires <t:${Math.floor(record.expires_at / 1000)}:R>`}\n` +
              `└ Invite: ${inviteUrl ? inviteUrl : "Unavailable (bot needs invite permission / server access)"}`
            );
          } else {
            const userId = record.user_id;
            let user = null;
            try { user = await client.users.fetch(userId); } catch {}
            lines.push(
              `**${number}. ${user ? user.tag : "Unknown / unavailable user"}**\n` +
              `└ ID: \`${userId}\`\n` +
              `└ Status: ${record.expires_at == null ? "Lifetime" : `Expires <t:${Math.floor(record.expires_at / 1000)}:R>`}\n` +
              `└ Granted: <t:${Math.floor((record.granted_at || Date.now()) / 1000)}:R>`
            );
          }
        }
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n\n")));
      }

      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("premiumlist:prev").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
        new ButtonBuilder().setCustomId("premiumlist:next").setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPages - 1),
        new ButtonBuilder().setCustomId("premiumlist:servers").setLabel("Servers").setStyle(type === "servers" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("premiumlist:members").setLabel("Members").setStyle(type === "members" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("premiumlist:refresh").setLabel("Refresh").setStyle(ButtonStyle.Success),
      );
      container.addActionRowComponents(row);
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("premiumlist:close").setLabel("Close").setStyle(ButtonStyle.Danger)
      );
      container.addActionRowComponents(closeRow);
      return { components: [container], flags: MessageFlags.IsComponentsV2 };
    };

    const reply = await message.reply(await build());
    const collector = reply.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: "Only the owner who opened this directory can use these controls.", ephemeral: true });
      }
      if (!config.ownerIds?.includes(interaction.user.id)) {
        return interaction.reply({ content: "Owner access required.", ephemeral: true });
      }
      try {
        if (interaction.customId === "premiumlist:close") {
          closed = true;
          collector.stop("closed");
          return interaction.update({ components: [], content: "Premium directory closed." });
        }
        if (interaction.customId === "premiumlist:prev") page--;
        if (interaction.customId === "premiumlist:next") page++;
        if (interaction.customId === "premiumlist:servers") { type = "servers"; page = 0; }
        if (interaction.customId === "premiumlist:members") { type = "members"; page = 0; }
        await interaction.update(await build());
      } catch (error) {
        client.logger?.error("PremiumListCommand", `Error: ${error.message}`, error);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: "Could not update the Premium directory.", ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: "Could not update the Premium directory.", ephemeral: true }).catch(() => {});
        }
      }
    });

    collector.on("end", async () => {
      if (closed) return;
      try {
        await reply.edit({ components: [], content: "Premium directory expired. Run `premiumlist` again." });
      } catch {}
    });
  }
}

export default new PremiumListCommand();
