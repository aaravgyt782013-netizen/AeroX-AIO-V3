import { logger } from "#utils/logger";

function reactionKey(reaction) {
  return reaction?.emoji?.id || reaction?.emoji?.name || reaction?.emoji?.identifier || null;
}

async function resolveReaction(reaction) {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message?.partial) await reaction.message.fetch();
  } catch (error) {
    logger.warn("ReactionRoles", "Could not fetch a partial reaction/message: " + (error?.message || error));
    return null;
  }
  return reaction;
}

export default {
  name: "messageReactionRemove",
  async execute(reaction, user, client) {
    if (user?.bot) return;
    const resolved = await resolveReaction(reaction);
    const message = resolved?.message;
    const guild = message?.guild;
    if (!guild) return;
    const key = reactionKey(resolved);
    if (!key) return;
    const data = client.db.guild.getReactionRoles(guild.id);
    const config = data[message.id];
    const roleId = config?.roles?.[key];
    if (!roleId) return;
    try {
      const member = await guild.members.fetch(user.id);
      const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
      if (role && !role.managed && role.position < guild.members.me.roles.highest.position && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "LightCore reaction role removed");
      }
    } catch (error) {
      logger.warn("ReactionRoles", "Failed to remove reaction role in " + guild.id + ": " + (error?.message || error));
    }
  }
};
