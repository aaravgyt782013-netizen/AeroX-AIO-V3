import { Command } from "#structures/classes/Command";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import emoji from "#config/emoji";
import { config } from "#config/config";
class RemovePremiumCommand extends Command {
  constructor() {
    super({ name: "removepremium", description: "Revoke Premium from a user", usage: "removepremium <user_id>", aliases: ["revokepremium", "removeprem", "revokeprem"], category: "Owner", examples: ["removepremium 123456789"], cooldown: 0, ownerOnly: true });
  }
  async execute({ client, message, args }) {
    if (!config.ownerIds?.includes(message.author.id)) return message.reply({ content: emoji.get("cross") + " This command is only available to bot owners." });
    const userId = args[0]?.replace(/[<@!>]/g, "");
    if (!userId || !/^\d{17,19}$/.test(userId)) return message.reply({ content: emoji.get("cross") + " Please provide a valid user ID or mention.\n**Usage:** `" + this.usage + "`" });
    const result = client.db.revokeUserPremium(userId);
    if (!result || result.changes < 1) return message.reply({ content: emoji.get("cross") + " This user does not have active Premium." });
    let user = null;
    try { user = await client.users.fetch(userId); } catch {}
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(emoji.get("check") + " **Premium Revoked**"));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("**User:** " + (user ? user.tag : "Unknown") + "\n**ID:** `" + userId + "`\n\nPremium access has been revoked for this user."));
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}
export default new RemovePremiumCommand();