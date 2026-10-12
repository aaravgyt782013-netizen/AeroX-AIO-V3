import { db } from "#database/DatabaseManager";
import { premiumFeatures } from "#managers/PremiumFeaturesManager";

const XP_COOLDOWN_MS = 60_000;

export default {
  name: "messageCreate",
  async execute(message) {
    if (!message.guild || message.author?.bot || !message.author?.id) return;
    if (!db.isGuildPremium(message.guild.id)) return;
    const settings = premiumFeatures.getLevelSettings(message.guild.id);
    if (!settings.enabled) return;

    const text = (message.content || "").trim();
    if (!text || text.length < 3 || text.startsWith(".") || text.startsWith("/")) return;

    const previous = premiumFeatures.getLevel(message.guild.id, message.author.id);
    if (Date.now() - previous.last_xp_at < XP_COOLDOWN_MS) return;

    const gained = 15 + Math.floor(Math.random() * 11);
    const updated = premiumFeatures.addXp(message.guild.id, message.author.id, gained);
    if (updated.level <= previous.level) return;

    const channel = settings.announce_channel_id
      ? message.guild.channels.cache.get(settings.announce_channel_id)
      : message.channel;
    if (!channel?.isTextBased?.()) return;

    await channel.send({
      content: `🎉 <@${message.author.id}> reached **Level ${updated.level}**! Keep chatting to earn more XP.`,
      allowedMentions: { users: [message.author.id] }
    }).catch(() => {});
  }
};
