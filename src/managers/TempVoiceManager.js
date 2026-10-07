import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType } from "discord.js";
import { db } from "#database/DatabaseManager";

export class TempVoiceManager {
  static isTemp(id) { return !!db.guild.getTempVoiceChannel(id); }
  static owner(id) { return db.guild.getTempVoiceChannel(id)?.owner_id || null; }
  static canManage(member, id) {
    return member.id === this.owner(id) || member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels);
  }
  static async createFromJoin(member) {
    const s=db.guild.getTempVoiceSettings(member.guild.id);
    if (!s.joinChannel || member.voice.channelId !== s.joinChannel) return;
    const parent=s.category ? member.guild.channels.cache.get(s.category) : null;
    const name=String(s.name || "🔊 {username} Room").replaceAll("{username}",member.displayName).replaceAll("{user}",member.displayName).replaceAll("{id}",member.id).slice(0,100);
    const ch=await member.guild.channels.create({
      name,type:ChannelType.GuildVoice,parent:parent?.type===ChannelType.GuildCategory?parent.id:undefined,
      userLimit:Math.max(0,Math.min(99,s.limit||0)),
      bitrate:Math.max(8000,Math.min(member.guild.maximumBitrate||384000,s.bitrate||64000)),
      permissionOverwrites:[{id:member.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak,PermissionFlagsBits.Stream,PermissionFlagsBits.UseVAD,PermissionFlagsBits.SendMessages]}],
      reason:"LightCore TempVoice Join-to-Create"
    });
    db.guild.setTempVoiceChannel(ch.id,member.guild.id,member.id);
    try { await member.voice.setChannel(ch,"LightCore TempVoice Join-to-Create"); } catch {}
    await this.sendPanel(ch);
  }
  static async handleLeave(ch) {
    if(!ch || !this.isTemp(ch.id)) return;
    // Delete the generated TempVoice as soon as the last member leaves.
    // The join-to-create channel itself is never treated as a generated room.
    if(ch.members?.size !== 0) return;

    const channelId = ch.id;
    db.guild.deleteTempVoiceChannel(channelId);

    try {
      if(ch.deletable) {
        await ch.delete("LightCore TempVoice became empty");
      }
    } catch {
      // If Discord rejects deletion, restore the DB record so the room can still be managed.
      const owner = this.owner(channelId);
      if(owner) db.guild.setTempVoiceChannel(channelId, ch.guild.id, owner);
    }
  }
  static panel(ch,notice="") {
    const owner=this.owner(ch.id);
    const locked=ch.permissionsFor(ch.guild.roles.everyone)?.has(PermissionFlagsBits.Connect)===false;
    const hidden=ch.permissionsFor(ch.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)===false;
    return new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("🔊 **LightCore TempVoice**"))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent((notice?"✅ **"+notice+"**\n\n":"")+"👑 Owner: <@"+owner+">\n👥 Members: **"+ch.members.size+"**"+(ch.userLimit?" / **"+ch.userLimit+"**":"")+"\n🔒 Locked: **"+(locked?"Yes":"No")+"** · 👁️ Hidden: **"+(hidden?"Yes":"No")+"**\n\nManage your temporary room below."))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("tv_lock").setLabel(locked?"Unlock":"Lock").setEmoji(locked?"🔓":"🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("tv_hide").setLabel(hidden?"Unhide":"Hide").setEmoji(hidden?"👁️":"🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("tv_claim").setLabel("Claim").setEmoji("👑").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("tv_delete").setLabel("Delete").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
      ))
      .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("tv_manage").setPlaceholder("⚙️ Manage room").addOptions(
        {label:"Rename",value:"rename",emoji:"✏️"},{label:"User limit",value:"limit",emoji:"👥"},{label:"Bitrate",value:"bitrate",emoji:"🎚️"},{label:"Kick",value:"kick",emoji:"👢"},{label:"Mute",value:"mute",emoji:"🔇"},{label:"Unmute",value:"unmute",emoji:"🔊"},{label:"Invite",value:"invite",emoji:"📨"},{label:"Transfer owner",value:"transfer",emoji:"👑"},{label:"Info",value:"info",emoji:"ℹ️"}
      )))
  }
  static async sendPanel(ch) { if(ch?.isSendable?.()) await ch.send({components:[this.panel(ch)],flags:MessageFlags.IsComponentsV2}); }
  static async refresh(ch,n="Settings updated"){ if(!ch?.isSendable?.())return; const m=ch.messages.cache.find(x=>x.author?.id===ch.guild.client.user.id&&x.components?.length); if(m) await m.edit({components:[this.panel(ch,n)],flags:MessageFlags.IsComponentsV2}).catch(()=>{}); else await this.sendPanel(ch); }
  static async modal(i,type){
    const title={rename:"Rename room",limit:"Set user limit",bitrate:"Set bitrate",kick:"Kick member",mute:"Mute member",unmute:"Unmute member",invite:"Create invite",transfer:"Transfer ownership"}[type]||"TempVoice";
    const label={rename:"Channel name",limit:"Limit (0 = unlimited)",bitrate:"Bitrate in kbps",kick:"Member ID or mention",mute:"Member ID or mention",unmute:"Member ID or mention",invite:"Member ID or mention",transfer:"New owner ID or mention"}[type]||"Value";
    return i.showModal(new ModalBuilder().setCustomId("tv_modal_"+type).setTitle(title).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(type==="rename"?100:50))));
  }
  static id(v){return String(v||"").replace(/[<@!>]/g,"").trim();}
  static async button(i){
    const ch=i.guild?.channels.cache.get(i.channelId); if(!ch||!this.isTemp(ch.id))return false;
    const owner=this.owner(ch.id);
    if(i.customId==="tv_claim"){ if(!db.guild.getTempVoiceSettings(ch.guild.id).claim)return i.reply({content:"Claiming is disabled for this server.",ephemeral:true}); if(owner&&ch.members.has(owner))return i.reply({content:"The current owner is still in the room.",ephemeral:true}); db.guild.setTempVoiceOwner(ch.id,i.user.id); await i.deferUpdate(); await this.refresh(ch,"Ownership claimed"); return true; }
    if(!this.canManage(i.member,ch.id))return i.reply({content:"Only the room owner or a server manager can use these controls.",ephemeral:true}).then(()=>true);
    if(i.customId==="tv_lock"){const x=ch.permissionsFor(ch.guild.roles.everyone)?.has(PermissionFlagsBits.Connect)===false;await ch.permissionOverwrites.edit(ch.guild.roles.everyone,{Connect:x?null:false}); await ch.permissionOverwrites.edit(owner,{Connect:true,ViewChannel:true});await i.deferUpdate();await this.refresh(ch,x?"Room unlocked":"Room locked");return true;}
    if(i.customId==="tv_hide"){const x=ch.permissionsFor(ch.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)===false;await ch.permissionOverwrites.edit(ch.guild.roles.everyone,{ViewChannel:x?null:false}); await ch.permissionOverwrites.edit(owner,{Connect:true,ViewChannel:true});await i.deferUpdate();await this.refresh(ch,x?"Room visible":"Room hidden");return true;}
    if(i.customId==="tv_delete"){await i.deferUpdate();db.guild.deleteTempVoiceChannel(ch.id);await ch.delete("LightCore TempVoice owner deleted room");return true;}
    return false;
  }
  static async select(i){
    if(i.customId!=="tv_manage")return false; const ch=i.guild?.channels.cache.get(i.channelId); if(!ch||!this.isTemp(ch.id))return false;
    if(!this.canManage(i.member,ch.id))return i.reply({content:"Only the room owner or a server manager can use these controls.",ephemeral:true}).then(()=>true);
    const type=i.values[0]; if(type==="info")return i.reply({content:"👑 Owner: <@"+this.owner(ch.id)+">\n👥 Members: "+ch.members.size+"\n👤 Limit: "+(ch.userLimit||"Unlimited")+"\n🎚️ Bitrate: "+Math.round(ch.bitrate/1000)+" kbps",ephemeral:true}).then(()=>true);
    await this.modal(i,type); return true;
  }
  static async submit(i){
    if(!i.customId.startsWith("tv_modal_"))return false; const ch=i.guild?.channels.cache.get(i.channelId); if(!ch||!this.isTemp(ch.id))return false;
    if(!this.canManage(i.member,ch.id))return i.reply({content:"Only the room owner or a server manager can use these controls.",ephemeral:true}).then(()=>true);
    const type=i.customId.slice(9),v=i.fields.getTextInputValue("value").trim();
    try {
      if(type==="rename")await ch.setName(v.slice(0,100),"LightCore TempVoice");
      else if(type==="limit"){const n=Number(v);if(!Number.isInteger(n)||n<0||n>99)throw Error();await ch.setUserLimit(n);}
      else if(type==="bitrate"){const n=Number(v);if(!Number.isFinite(n)||n<8||n>(ch.guild.maximumBitrate/1000))throw Error();await ch.setBitrate(n*1000);}
      else if(["kick","mute","unmute","invite","transfer"].includes(type)){const m=await i.guild.members.fetch(this.id(v)).catch(()=>null);if(!m)throw Error();
        if(type==="kick"&&m.voice.channelId===ch.id)await m.voice.disconnect("TempVoice owner action");
        if(type==="mute"&&m.voice.channelId===ch.id)await m.voice.setMute(true,"TempVoice owner action");
        if(type==="unmute"&&m.voice.channelId===ch.id)await m.voice.setMute(false,"TempVoice owner action");
        if(type==="invite"){const inv=await ch.createInvite({maxAge:86400,maxUses:1,unique:true,reason:"LightCore TempVoice"});return i.reply({content:"📨 "+inv.url,ephemeral:true}).then(()=>true);}
        if(type==="transfer")db.guild.setTempVoiceOwner(ch.id,m.id);
      }
      await i.reply({content:"✅ TempVoice updated.",ephemeral:true});await this.refresh(ch);return true;
    }catch{await i.reply({content:"Invalid value or missing bot permission.",ephemeral:true});return true;}
  }
}