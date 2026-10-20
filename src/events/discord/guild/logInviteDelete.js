import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "inviteDelete",
  async execute(invite) {
    if (!invite.guild) return;
    await LoggingManager.send(invite.guild, "invite", {
      title: "Invite Deleted",
      emoji: "🗑️",
      color: 0xED4245,
      description: "A server invite was deleted.",
      fields: [
        { name: "Code", value: String(invite.code || "Unknown"), inline: true },
        { name: "Channel", value: invite.channelId ? "<#" + invite.channelId + ">" : "Unknown", inline: true }
      ]
    });
  }
};
