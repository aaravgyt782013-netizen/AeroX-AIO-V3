import { Command } from "#structures/classes/Command";
import { EmbedBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import { premiumFeatures } from "#managers/PremiumFeaturesManager";

class ProfileCommand extends Command {
  constructor() {
    super({ name: "profile", description: "View or customize your User Premium profile card", usage: "profile [set title|bio|color <value>]", aliases: ["myprofile", "usercard"], category: "Premium", cooldown: 5 });
  }

  async execute({ message, args }) {
    const target = message.mentions.users.first() || message.author;
    const isSelf = target.id === message.author.id;
    const premium = db.isUserPremium(target.id);

    if (args[0]?.toLowerCase() === "set") {
      if (!isSelf) return message.reply("You can only customize your own profile.");
      if (!premium) return message.reply("💎 This customization requires **User Premium**.");
      const field = (args[1] || "").toLowerCase();
      const value = args.slice(2).join(" ").trim();
      if (!["title", "bio", "color"].includes(field) || !value) {
        return message.reply("Usage: `.profile set title <text>`, `.profile set bio <text>`, or `.profile set color #5865F2`");
      }
      const current = premiumFeatures.getProfile(target.id);
      if (field === "title" && value.length > 32) return message.reply("Title must be 32 characters or fewer.");
      if (field === "bio" && value.length > 180) return message.reply("Bio must be 180 characters or fewer.");
      if (field === "color" && !/^#(?:[0-9a-fA-F]{6})$/.test(value)) return message.reply("Use a hex color such as `#5865F2`.");
      premiumFeatures.setProfile(target.id, { ...current, [field]: value });
      return message.reply(`✅ Your premium profile ${field} has been updated.`);
    }

    const profile = premiumFeatures.getProfile(target.id);
    const color = /^#(?:[0-9a-fA-F]{6})$/.test(profile.color || "") ? Number.parseInt(profile.color.slice(1), 16) : 0x5865F2;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: profile.title || `${target.username}'s Profile`, iconURL: target.displayAvatarURL() })
      .setDescription(profile.bio || "No bio added yet.")
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields({ name: "Membership", value: premium ? "💎 User Premium" : "Standard", inline: true });
    if (isSelf && premium) embed.setFooter({ text: "Customize with .profile set title|bio|color" });
    return message.reply({ embeds: [embed] });
  }
}

export default new ProfileCommand();
