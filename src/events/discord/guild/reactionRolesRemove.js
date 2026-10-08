import { PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";

function keyOf(reaction) {
  return reaction?.emoji?.id ? "id:" + reaction.emoji.id : "u:" + (reaction?.emoji?.name || "");
}

export default {
  name: "messageReactionRemove",
  async execute(reaction, user) {
    if (!reaction || user?.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);
    const guild = reaction.message?.guild;
    if (!guild) return;
    const roleId = db.guild.getReactionRoles(guild.id)[reaction.message.id]?.roles?.[keyOf(reaction)];
    if (!roleId) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    const role = guild.roles.cache.get(roleId);
    const botMember = guild.members.me;
    if (!member || !role || !botMember) return;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return;
    if (role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) return;
    await member.roles.remove(role, "LightCore reaction role").catch(() => {});
  },
};
