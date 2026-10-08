import { PermissionFlagsBits } from "discord.js";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

function keyOf(reaction) {
  return reaction?.emoji?.id
    ? "id:" + reaction.emoji.id
    : "u:" + (reaction?.emoji?.name || "");
}

async function hydrate(reaction) {
  if (reaction?.partial) await reaction.fetch().catch(() => null);
  if (reaction?.message?.partial) await reaction.message.fetch().catch(() => null);
  return reaction;
}

async function apply(reaction, user, add) {
  if (!reaction?.message?.guild || !user || user.bot) return;
  const guild = reaction.message.guild;
  const mapping = db.guild.getReactionRoles(guild.id)[reaction.message.id]?.roles || {};
  const roleId = mapping[keyOf(reaction)];
  if (!roleId) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  const role = guild.roles.cache.get(roleId);
  const botMember = guild.members.me;
  if (!member || !role || !botMember) return;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return;
  if (role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) return;

  try {
    if (add) {
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, "LightCore reaction role");
    } else if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, "LightCore reaction role");
    }
  } catch (error) {
    logger.warn("ReactionRoles", "Could not " + (add ? "add" : "remove") + " role " + role.id + ": " + (error?.message || error));
  }
}

export default {
  name: "messageReactionAdd",
  async execute(reaction, user) {
    await apply(await hydrate(reaction), user, true);
  },
};
