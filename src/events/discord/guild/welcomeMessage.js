import { db } from "#database/DatabaseManager";
import { renderAutomationMessage } from "#utils/AutomationUtils";
import { logger } from "#utils/logger";
import { EmbedBuilder } from "discord.js";
import emoji from "#config/emoji";

function buildWelcomeEmbed(member, content, title = null) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(title || ("👋 Welcome to " + member.guild.name))
    .setDescription(content)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: "LightCore • Welcome System" })
    .setTimestamp();
}

export default {
  name: "guildMemberAdd",
  async execute(member) {
    if (member.user.bot) return;

    try {
      const autoroleId = db.guild?.getAutorole?.(member.guild.id);
      if (autoroleId) {
        const role = member.guild.roles.cache.get(autoroleId);
        if (role && !role.managed && role.position < member.guild.members.me.roles.highest.position) {
          await member.roles.add(role, "LightCore autorole").catch(() => null);
        }
      }
    } catch (error) {
      logger.error("AutoRole", "Failed to assign autorole:", error);
    }

    const setting = db.getWelcome(member.guild.id);
    const dm = db.getWelcomeDM(member.guild.id);

    // System 1: public server-channel welcome.
    if (setting?.enabled) {
      try {
        const channel = member.guild.channels.cache.get(setting.channel_id);
        if (channel?.isTextBased()) {
          let inviter = null;
          const inviteData = db.invites?.getMemberInvites?.(member.guild.id, member.id);
          if (inviteData?.inviter_id) {
            inviter = member.guild.members.cache.get(inviteData.inviter_id) ||
              await member.guild.members.fetch(inviteData.inviter_id).catch(() => null);
          }

          const content = renderAutomationMessage(setting.message, {
            member,
            guild: member.guild,
            channel,
            inviter,
          });

          if (setting.welcome_style === "direct") {
            await channel.send({
              content,
              allowedMentions: { parse: ["users", "roles"] },
            });
          } else {
            await channel.send({
              embeds: [buildWelcomeEmbed(member, content)],
              allowedMentions: { parse: ["users", "roles"] },
            });
          }
        }
      } catch (error) {
        logger.error("WelcomeMessage", "Failed to send server-channel welcome:", error);
      }
    }

    // System 2: independent private DM welcome.
    // This intentionally runs even when the public channel system is disabled.
    if (dm?.enabled && dm.message) {
      try {
        const content = renderAutomationMessage(dm.message, {
          member,
          guild: member.guild,
          channel: null,
          inviter: null,
        });

        await member.send({
          embeds: [buildWelcomeEmbed(member, content, "👋 Welcome to " + member.guild.name)],
        });
      } catch (error) {
        // DMs can legitimately be blocked by the member's privacy settings.
        logger.debug("WelcomeDM", "Could not DM " + member.user.tag + ": " + (error?.message || "DM unavailable"));
      }
    }
  },
};
