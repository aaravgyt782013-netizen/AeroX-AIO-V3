import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder, MessageFlags
} from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { config } from "#config/config";

function validUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch { return false; }
}

function validColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

async function fetchImageBuffer(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Image download failed (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("The URL must point directly to an image.");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 8 * 1024 * 1024) {
    throw new Error("The image is larger than Discord's 8 MB guild-profile limit.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("The image is larger than Discord's 8 MB guild-profile limit.");
  }

  return buffer;
}

class PremiumProfileCommand extends Command {
  constructor() {
    super({
      name: "premiumprofile",
      description: "Customize AeroX's Premium profile for this server",
      usage: "premiumprofile <view|name|avatar|banner|color|reset> [value]",
      aliases: ["pprofile", "serverprofile"],
      category: "Premium",
      cooldown: 3,
      guildPrem: true,
    });
  }

  async execute({ client, message, args }) {
    if (!message.guild) {
      return message.reply({ content: emoji.get("cross") + " This command can only be used inside a server." });
    }

    const premium = db.isGuildPremium(message.guild.id);
    if (!premium) {
      return message.reply({
        content: `${emoji.get("info")} This feature requires **Guild Premium**.`,
      });
    }

    const action = (args[0] || "view").toLowerCase();
    const profile = db.getGuildProfile(message.guild.id) || {};

    if (action === "view") {
      const name = profile.profile_name || message.guild.name + " • AeroX";
      const color = profile.color || "#5865F2";
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `${emoji.get("premium")} **${name}**\nPremium server profile for **${message.guild.name}**`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Color:** \`${color}\`\n**Avatar:** ${profile.avatar_url ? "Configured" : "Default"}\n**Banner:** ${profile.banner_url ? "Configured" : "Not set"}`
        ));
      if (profile.avatar_url && validUrl(profile.avatar_url)) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(profile.avatar_url));
      }
      container.addSectionComponents(section);

      if (profile.banner_url && validUrl(profile.banner_url)) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`[Premium Banner](${profile.banner_url})`));
      }

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (!["name", "avatar", "banner", "color", "reset"].includes(action)) {
      return message.reply({ content: `${emoji.get("cross")} Use: \`premiumprofile view|name|avatar|banner|color|reset\`` });
    }

    // Only the Discord server owner or a configured bot owner can modify
    // the server's Premium profile (name, avatar, banner, color, or reset).
    const isGuildOwner = message.guild.ownerId === message.author.id;
    const isBotOwner = config.ownerIds?.includes(message.author.id);
    if (!isGuildOwner && !isBotOwner) {
      return message.reply({
        content: emoji.get("cross") + " Only the **server owner** or **bot owner** can change the Premium server profile.",
      });
    }

    if (action === "reset") {
      try {
        await message.guild.members.editMe({
          nick: null,
          avatar: null,
          banner: null,
          reason: "LightCore Premium profile reset",
        });
        db.resetGuildProfile(message.guild.id);
        return message.reply({
          content: `${emoji.get("check")} Premium server profile reset — name, avatar and banner restored to default.`,
        });
      } catch (error) {
        return message.reply({
          content: `${emoji.get("cross")} Discord rejected the Premium profile reset: ${error?.message || "Unknown error"}`,
        });
      }
    }

    const value = args.slice(1).join(" ").trim();
    if (!value) return message.reply({ content: `${emoji.get("cross")} Please provide a value.` });

    if (action === "name") {
      if (value.length > 32) {
        return message.reply({ content: `${emoji.get("cross")} Profile name must be 32 characters or fewer.` });
      }
      try {
        await message.guild.members.editMe({
          nick: value,
          reason: "LightCore Premium server profile",
        });
        db.setGuildProfile(message.guild.id, { profile_name: value });
      } catch (error) {
        return message.reply({
          content: `${emoji.get("cross")} I could not change my server name: ${error?.message || "Unknown error"}`,
        });
      }
    } else if (action === "avatar" || action === "banner") {
      const attachment = message.attachments.first();
      const imageUrl = validUrl(value) ? value : (attachment?.url || "");

      if (!imageUrl) {
        return message.reply({
          content: `${emoji.get("cross")} Provide a direct HTTPS image URL or attach an image to the command.`,
        });
      }

      try {
        const imageBuffer = await fetchImageBuffer(imageUrl);
        await message.guild.members.editMe({
          [action]: imageBuffer,
          reason: `LightCore Premium server ${action}`,
        });
        db.setGuildProfile(message.guild.id, {
          [action === "avatar" ? "avatar_url" : "banner_url"]: imageUrl,
        });
      } catch (error) {
        return message.reply({
          content: `${emoji.get("cross")} I could not update the Premium ${action}: ${error?.message || "Unknown error"}`,
        });
      }
    } else if (action === "color") {
      if (!validColor(value)) return message.reply({ content: `${emoji.get("cross")} Color must look like \`#5865F2\`.` });
      db.setGuildProfile(message.guild.id, { color: value });
    }

    return message.reply({
      content: `${emoji.get("check")} Premium profile **${action}** updated successfully. Discord has applied the server-specific bot profile.`,
    });
  }
}

export default new PremiumProfileCommand();
