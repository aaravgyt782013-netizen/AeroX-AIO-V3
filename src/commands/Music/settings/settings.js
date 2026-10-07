import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, PermissionFlagsBits
} from "discord.js";
import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";

class MusicSettingsCommand extends Command {
  constructor() {
    super({
      name: "settings",
      description: "Open the music settings control panel",
      usage: "settings [djrole|autoplay|announce|voteskip|source]",
      aliases: ["musicsettings", "musicconfig", "musicsetup"],
      category: "music",
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageGuild],
      enabledSlash: true,
      slashData: {
        name: "musicsettings",
        description: "Open and manage the server music settings",
        options: [
          { name:"setting", description:"Setting to change", type:3, required:false,
            choices:[
              {name:"DJ Role",value:"djrole"},{name:"Autoplay",value:"autoplay"},
              {name:"Announcements",value:"announce"},{name:"Vote Skip",value:"voteskip"},
              {name:"Source",value:"source"},{name:"24/7",value:"247"}
            ]},
          { name:"value", description:"on/off, role mention/ID, or source", type:3, required:false }
        ]
      }
    });
  }

  async execute({message,args}) {
    if (!args?.length) return this.show(message);
    return this.apply(message,args[0].toLowerCase(),args.slice(1).join(" "));
  }

  async slashExecute({interaction}) {
    const setting=interaction.options.getString("setting");
    const value=interaction.options.getString("value") || "";
    if (!setting) return this.show(interaction);
    return this.apply(interaction,setting,value);
  }

  async apply(ctx,setting,value) {
    const guildId=ctx.guild.id;
    const v=(value||"").trim();
    if (setting==="djrole") {
      let roleId=null;
      if (v && !["off","none","disable"].includes(v.toLowerCase())) {
        roleId=v.replace(/[<@&>]/g,"");
        if (!ctx.guild.roles.cache.get(roleId)) return this.reply(ctx,"That role was not found.");
      }
      db.guild.setDJRole(guildId,roleId);
    } else if (["autoplay","announce","voteskip","247"].includes(setting)) {
      const on=["on","enable","enabled","true","yes"].includes(v.toLowerCase());
      const off=["off","disable","disabled","false","no"].includes(v.toLowerCase());
      if (!on && !off) return this.reply(ctx,"Use on or off.");
      if (setting==="autoplay") db.guild.setAutoplay(guildId,on);
      if (setting==="announce") db.guild.setAnnounceSongs(guildId,on);
      if (setting==="voteskip") db.guild.setVoteSkip(guildId,on);
      if (setting==="247") db.guild.setMusicSettings(guildId,{mode247:on});
    } else if (setting==="source") {
      const map={youtube:"ytsearch",yt:"ytsearch",youtube_music:"ytmsearch",ytm:"ytmsearch",spotify:"spsearch",soundcloud:"scsearch",apple:"amsearch",deezer:"dzsearch",jiosaavn:"jssearch"};
      const source=map[v.toLowerCase()];
      if (!source) return this.reply(ctx,"Source must be YouTube, YouTube Music, Spotify, SoundCloud, Apple, Deezer, or JioSaavn.");
      db.guild.setMusicSettings(guildId,{source});
    } else return this.reply(ctx,"Unknown music setting.");
    return this.show(ctx,true);
  }

  build(guildId,changed=false) {
    const s=db.guild.getMusicSettings(guildId);
    const role=s.djRole ? "<@&"+s.djRole+">" : "Disabled (everyone can control)";
    const source=(s.source||"ytmsearch").replace("ytmsearch","YouTube Music").replace("ytsearch","YouTube").replace("spsearch","Spotify").replace("scsearch","SoundCloud");
    const c=new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent("🎵 **LightCore Music Settings**"));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      (changed ? "✅ **Settings updated.**\\n\\n" : "")+
      "**Playback**\\n"+
      "├─ 🔄 Autoplay: **"+(s.autoplay?"ON":"OFF")+"**\\n"+
      "├─ 📢 Song announcements: **"+(s.announceSongs?"ON":"OFF")+"**\\n"+
      "├─ 🗳️ Vote skip: **"+(s.voteSkip?"ON":"OFF")+"**\\n"+
      "├─ ♾️ 24/7: **"+(s.mode247?"ON":"OFF")+"**\\n"+
      "└─ 🔎 Default source: **"+source+"**\\n\\n"+
      "**Access**\\n└─ 👑 DJ role: "+role+"\\n\\n"+
      "Quick controls are below. You can also use: settings djrole @DJ, settings autoplay on, settings source spotify"
    ));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("musicsettings_autoplay").setLabel("Autoplay").setStyle(s.autoplay?ButtonStyle.Success:ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("musicsettings_announce").setLabel("Announcements").setStyle(s.announceSongs?ButtonStyle.Success:ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("musicsettings_voteskip").setLabel("Vote Skip").setStyle(s.voteSkip?ButtonStyle.Success:ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("musicsettings_247").setLabel("24/7").setStyle(s.mode247?ButtonStyle.Success:ButtonStyle.Secondary)
    ));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("musicsettings_source").setPlaceholder("Choose default music source").addOptions(
        {label:"YouTube Music",value:"ytmsearch",emoji:"▶️",default:s.source==="ytmsearch"},
        {label:"YouTube",value:"ytsearch",emoji:"📺",default:s.source==="ytsearch"},
        {label:"Spotify",value:"spsearch",emoji:"🟢",default:s.source==="spsearch"},
        {label:"SoundCloud",value:"scsearch",emoji:"🟠",default:s.source==="scsearch"}
      )
    ));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId("musicsettings_djrole").setPlaceholder("Set / change DJ role").setMinValues(0).setMaxValues(1)
    ));
    return c;
  }

  async show(ctx,changed=false) {
    const message=ctx.user
      ? await ctx.reply({components:[this.build(ctx.guild.id,changed)],flags:MessageFlags.IsComponentsV2,fetchReply:true}).then(()=>ctx.fetchReply())
      : await ctx.channel.send({components:[this.build(ctx.guild.id,changed)],flags:MessageFlags.IsComponentsV2});
    this.collect(message,ctx.author?.id||ctx.user.id,ctx.guild.id);
    return message;
  }

  collect(message,userId,guildId) {
    const collector=message.createMessageComponentCollector({time:300000,filter:i=>i.user.id===userId});
    collector.on("collect",async i=>{
      try {
        if (i.customId==="musicsettings_djrole") db.guild.setDJRole(guildId,i.values?.[0]||null);
        else if (i.customId==="musicsettings_source") db.guild.setMusicSettings(guildId,{source:i.values[0]});
        else {
          const key=i.customId.replace("musicsettings_","");
          const s=db.guild.getMusicSettings(guildId);
          const enabled=key==="autoplay"?s.autoplay:key==="announce"?s.announceSongs:key==="voteskip"?s.voteSkip:s.mode247;
          if(key==="autoplay") db.guild.setAutoplay(guildId,!enabled);
          if(key==="announce") db.guild.setAnnounceSongs(guildId,!enabled);
          if(key==="voteskip") db.guild.setVoteSkip(guildId,!enabled);
          if(key==="247") db.guild.setMusicSettings(guildId,{mode247:!enabled});
        }
        await i.deferUpdate();
        await message.edit({components:[this.build(guildId,true)],flags:MessageFlags.IsComponentsV2});
      } catch(e) {
        await i.reply({content:"Could not update music settings.",ephemeral:true}).catch(()=>{});
      }
    });
  }

  async reply(ctx,text) {
    if (ctx.user) return ctx.reply({content:text,ephemeral:true});
    return ctx.reply(text);
  }
}
export default new MusicSettingsCommand();
