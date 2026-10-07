import { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";
import { TempVoiceManager } from "#managers/TempVoiceManager";

class TempVoiceCommand extends Command {
  constructor(){ super({name:"tempvoice",description:"Configure LightCore Join-to-Create temporary voice channels",usage:"tempvoice <setup|settings|disable|channel|category|name|limit|bitrate>",aliases:["tv","tempvc","join2create"],category:"Voice",cooldown:3,userPermissions:[PermissionFlagsBits.ManageGuild],enabledSlash:true,slashData:{name:"tempvoice",description:"Configure LightCore temporary voice channels"}}); }
  async execute({message,args}){return this.run(message,args||[]);}
  async slashExecute({interaction}){return this.run(interaction,[]);}
  async run(ctx,args){
    const a=(args[0]||"settings").toLowerCase(),g=ctx.guild;
    if(a==="setup"){
      let s=db.guild.getTempVoiceSettings(g.id),cat=s.category?g.channels.cache.get(s.category):null,join=s.joinChannel?g.channels.cache.get(s.joinChannel):null;
      if(!cat||cat.type!==ChannelType.GuildCategory)cat=await g.channels.create({name:"LightCore TempVoice",type:ChannelType.GuildCategory,reason:"LightCore TempVoice setup"});
      if(!join||join.type!==ChannelType.GuildVoice)join=await g.channels.create({name:"➕ Join to Create",type:ChannelType.GuildVoice,parent:cat.id,reason:"LightCore TempVoice setup"});
      db.guild.setTempVoiceSettings(g.id,{category:cat.id,joinChannel:join.id});
      return this.reply(ctx,"✅ LightCore TempVoice is ready.\\nJoin <#"+join.id+"> to create your temporary room.");
    }
    if(a==="disable"){db.guild.setTempVoiceSettings(g.id,{joinChannel:null});return this.reply(ctx,"✅ Join-to-Create disabled.");}
    if(a==="settings")return this.settings(ctx);
    if(a==="claim"){const ch=ctx.member?.voice?.channel;if(!ch||!TempVoiceManager.isTemp(ch.id))return this.reply(ctx,"Join your temporary room first.");db.guild.setTempVoiceOwner(ch.id,ctx.author?.id||ctx.user.id);return this.reply(ctx,"👑 You now own this room.");}
    if(["channel","category","name","limit","bitrate"].includes(a))return this.apply(ctx,a,args.slice(1).join(" "));
    return this.reply(ctx,"Unknown TempVoice option. Use tempvoice settings.");
  }
  async apply(ctx,a,v){const g=ctx.guild;
    if(a==="channel"){const id=String(v).replace(/[<#>]/g,""),ch=g.channels.cache.get(id);if(!ch||ch.type!==ChannelType.GuildVoice)return this.reply(ctx,"Provide a valid voice channel.");db.guild.setTempVoiceSettings(g.id,{joinChannel:ch.id});return this.settings(ctx,"Join channel updated");}
    if(a==="category"){const id=String(v).replace(/[<#>]/g,""),ch=g.channels.cache.get(id);if(!ch||ch.type!==ChannelType.GuildCategory)return this.reply(ctx,"Provide a valid category.");db.guild.setTempVoiceSettings(g.id,{category:ch.id});return this.settings(ctx,"Category updated");}
    if(a==="name"){if(!v)return this.reply(ctx,"Provide a name template.");db.guild.setTempVoiceSettings(g.id,{name:String(v).slice(0,100)});return this.settings(ctx,"Name updated");}
    if(a==="limit"){const n=Number(v);if(!Number.isInteger(n)||n<0||n>99)return this.reply(ctx,"Limit must be 0-99.");db.guild.setTempVoiceSettings(g.id,{limit:n});return this.settings(ctx,"Limit updated");}
    if(a==="bitrate"){const n=Number(v);if(!Number.isFinite(n)||n<8||n>384)return this.reply(ctx,"Bitrate must be 8-384 kbps.");db.guild.setTempVoiceSettings(g.id,{bitrate:n*1000});return this.settings(ctx,"Bitrate updated");}
  }
  build(id,n=""){const s=db.guild.getTempVoiceSettings(id);return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("🔊 **LightCore TempVoice Settings**")).addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents(new TextDisplayBuilder().setContent((n?"✅ **"+n+"**\\n\\n":"")+"🚪 Join: "+(s.joinChannel?"<#"+s.joinChannel+">":"Not configured")+"\\n📁 Category: "+(s.category?"<#"+s.category+">":"Not configured")+"\\n📝 Name: `"+s.name+"`\\n👥 Limit: **"+(s.limit||"Unlimited")+"**\\n🎚️ Bitrate: **"+Math.round(s.bitrate/1000)+" kbps**\\n🗑️ Auto-delete: **"+(s.autoDelete?"ON":"OFF")+"**\\n👑 Claim: **"+(s.claim?"ON":"OFF")+"\\n\\nUse tempvoice setup for automatic setup."));}
  async settings(ctx,n=""){const d={components:[this.build(ctx.guild.id,n)],flags:MessageFlags.IsComponentsV2};return ctx.user?ctx.reply({...d,ephemeral:true}):ctx.reply(d);}
  async reply(ctx,t){return ctx.user?ctx.reply({content:t,ephemeral:true}):ctx.reply(t);}
}
export default new TempVoiceCommand();