import { db } from "#database/DatabaseManager";
import { renderAutomationMessage } from "#utils/AutomationUtils";
import { logger } from "#utils/logger";

const cooldowns = new Map();
const COOLDOWN_MS = 2000;

export default {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot || !message.guild || !message.content) return;
    try {
      const rules = db.getAutoresponders(message.guild.id);
      if (!rules.length) return;
      const content = message.content.trim().toLowerCase();
      const now = Date.now();

      for (const rule of rules) {
        const trigger = rule.trigger_text.toLowerCase();
        const matches = rule.match_type === "exact"
          ? content === trigger
          : content.includes(trigger);
        if (!matches) continue;

        const key = message.guild.id + ":" + rule.id;
        const last = cooldowns.get(key) || 0;
        if (now - last < COOLDOWN_MS) continue;
        cooldowns.set(key, now);

        const rendered = renderAutomationMessage(rule.response, {
          member: message.member,
          guild: message.guild,
          channel: message.channel,
          message: message.content,
        });

        await message.channel.send({
          content: rendered,
          allowedMentions: { parse: ["users", "roles"] },
        });
      }
    } catch (error) {
      logger.error("AutoResponder", "Failed to process autoresponder:", error);
    }
  },
};
