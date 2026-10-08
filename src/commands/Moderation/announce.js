import { EmbedBuilder, PermissionFlagsBits } from "discord.js";

function colorOf(value) {
  const raw = String(value || "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(raw) ? parseInt(raw, 16) : 0x5865F2;
}

function parseFlags(input) {
  let text = input.trim();
  const flags = {};
  const specs = [
    ["title", /--title\s+(?:"([^"]+)"|([^\s]+))/i],
    ["color", /--color\s+(#[0-9a-f]{6}|[0-9a-f]{6})/i],
    ["ping", /--ping(?:\s+(everyone|here|none))?/i],
    ["image", /--image\s+(https?:\/\/\S+)/i],
    ["footer", /--footer\s+(?:"([^"]+)"|([^\s]+))/i],
  ];
  for (const [key, regex] of specs) {
    const m = text.match(regex);
    if (!m) continue;
    flags[key] = m[1] || m[2] || (key === "ping" ? "everyone" : null);
    text = text.replace(m[0], "").trim();
  }
  return { flags, text };
}

function makeEmbed(guild, member, text, flags) {
  const embed = new EmbedBuilder()
    .setColor(colorOf(flags.color))
    .setTitle("📢 " + (flags.title || "Server Announcement"))
    .setDescription(text.slice(0, 4096))
    .setTimestamp();
  embed.setAuthor({ name: member.displayName || member.user?.username || "LightCore", iconURL: member.displayAvatarURL?.({ size: 128 }) });
  embed.setFooter({ text: flags.footer || guild.name, iconURL: guild.iconURL?.({ size: 64 }) || undefined });
  if (flags.image && /^https?:\/\//i.test(flags.image)) embed.setImage(flags.image);
  return embed;
}

export default {
  name: "announce",
  description: "Send a polished server announcement.",
  usage: "announce [#channel] <message> [--title title] [--ping everyone|here|none]",
  aliases: ["announcement", "broadcast", "bc"],
  category: "Moderation",
  cooldown: 5,
  userPermissions: [PermissionFlagsBits.ManageGuild],
  permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  enabledSlash: true,
  slashData: {
    name: "announce",
    description: "Send a polished server announcement.",
    options: [
      {name:"message",description:"Announcement text.",type:3,required:true},
      {name:"channel",description:"Target channel.",type:7,required:false,channel_types:[0,5]},
      {name:"title",description:"Announcement title.",type:3,required:false},
      {name:"color",description:"Hex color such as #5865F2.",type:3,required:false},
      {name:"ping",description:"Mention everyone, here, or nobody.",type:3,required:false,choices:[{name:"Everyone",value:"everyone"},{name:"Here",value:"here"},{name:"Nobody",value:"none"}]},
      {name:"image",description:"Optional image URL.",type:3,required:false},
      {name:"footer",description:"Optional footer.",type:3,required:false},
    ],
  },
  async execute({ message, args }) {
    let target = message.channel;
    let raw = args.join(" ").trim();
    const mentioned = message.mentions.channels.first();
    if (mentioned && args[0]?.startsWith("<#")) { target = mentioned; raw = args.slice(1).join(" ").trim(); }
    else if (/^\d{15,25}$/.test(args[0] || "")) { const ch=message.guild.channels.cache.get(args[0]); if(ch?.isTextBased()) { target=ch; raw=args.slice(1).join(" ").trim(); } }
    const {flags,text}=parseFlags(raw);
    if (!text) return message.reply("❌ Give me announcement text. Example: announce #news Server maintenance tonight --ping everyone --title Maintenance");
    const ping=flags.ping || "none";
    const content=ping==="everyone" ? "@everyone" : ping==="here" ? "@here" : undefined;
    const sent=await target.send({content,embeds:[makeEmbed(message.guild,message.member,text,flags)],allowedMentions:{parse:ping==="none"?[]:["everyone"]}});
    if (target.id !== message.channel.id) await message.delete().catch(()=>{});
    const confirmation=await message.channel.send("📢 Announcement sent to <#" + target.id + ">.");
    setTimeout(()=>confirmation.delete().catch(()=>{}),5000);
    return sent;
  },
  async slashExecute({ interaction }) {
    const target=interaction.options.getChannel("channel") || interaction.channel;
    const message=interaction.options.getString("message",true);
    const ping=interaction.options.getString("ping") || "none";
    const flags={title:interaction.options.getString("title"),color:interaction.options.getString("color"),image:interaction.options.getString("image"),footer:interaction.options.getString("footer")};
    const content=ping==="everyone" ? "@everyone" : ping==="here" ? "@here" : undefined;
    await target.send({content,embeds:[makeEmbed(interaction.guild,interaction.member,message,flags)],allowedMentions:{parse:ping==="none"?[]:[ping]}});
    return interaction.reply({content:"📢 Announcement sent to <#" + target.id + ">.",ephemeral:true});
  },
};