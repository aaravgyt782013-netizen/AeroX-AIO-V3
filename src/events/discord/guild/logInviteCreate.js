import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "inviteCreate",
  async execute(invite) {
    if (!invite.guild) return;
    await LoggingManager.send(invite.guild, "invite", {
      title: "Invite Created",
      emoji: "🔗",
      description: "A server invite was created.",
      fields: [
        { name: "Code", value: String(invite.code || "Unknown"), inline: true },
        { name: "Channel", value: invite.channelId ? "<#" + invite.channelId + ">" : "Unknown", inline: true },
        { name: "Creator", value: invite.inviter ? "<@" + invite.inviter.id + ">" : "Unknown", inline: true },
        { name: "Uses", value: String(invite.maxUses || "Unlimited"), inline: true },
        { name: "Expires", value: invite.expiresAt ? invite.expiresAt.toISOString() : "Never", inline: true }
      ]
    });
  }
};
