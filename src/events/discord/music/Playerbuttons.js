import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { PlayerManager } from '#managers/PlayerManager';
import { db } from '#database/DatabaseManager';
import { logger } from '#utils/logger';

export default {
  name: 'interactionCreate', once: false,
  async execute(interaction, client) {
    try {
      if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
      const ids=['music_previous','music_pause','music_skip','music_stop','music_controls_select','music_player_select'];
      if (!ids.includes(interaction.customId)) return;
      if (!interaction.member?.voice?.channel) return interaction.reply({content:'❌ You must be in a voice channel to use music controls.',ephemeral:true});
      const player=client.music?.getPlayer(interaction.guild.id);
      if (!player) return interaction.reply({content:'❌ No music player found for this server.',ephemeral:true});
      const pm=new PlayerManager(player);
      if (pm.voiceChannelId && interaction.member.voice.channelId!==pm.voiceChannelId) return interaction.reply({content:'❌ You must be in the same voice channel as the bot to use controls.',ephemeral:true});
      const settings=db.guild.getMusicSettings(interaction.guild.id);
      const privileged=interaction.member.permissions.has('Administrator') || (settings.djRole && interaction.member.roles.cache.has(settings.djRole));
      if (settings.djRole && !privileged) return interaction.reply({content:'👑 You need the configured DJ role to control music.',ephemeral:true});
      if (['music_pause','music_skip','music_previous'].includes(interaction.customId) && !pm.hasCurrentTrack) return interaction.reply({content:'❌ No track is currently playing.',ephemeral:true});
      await interaction.deferReply({ephemeral:true});
      if (interaction.isButton()) await handleButton(interaction,pm);
      else await handleSelect(interaction,pm,interaction.guild.id);
    } catch(error) { logger.error('InteractionCreate','Music control error:',error); if(!interaction.replied) await interaction.reply({content:'❌ An error occurred while processing your request.',ephemeral:true}).catch(()=>{}); }
  }
};

async function handleButton(i,pm){
  let response='';
  switch(i.customId){
    case 'music_previous': response=await pm.playPrevious()?'⏮️ Playing the previous track.':'❌ No previous track available.'; break;
    case 'music_pause': if(pm.isPaused){await pm.resume();response='▶️ Music resumed.';}else{await pm.pause();response='⏸️ Music paused.';} break;
    case 'music_skip': {const title=pm.currentTrack?.info?.title||'Unknown Track';await pm.skip();response='⏭️ Skipped **'+title+'**.';break;}
    case 'music_stop': await pm.stop();response='⏹️ Music stopped and the queue was cleared.';break;
  }
  await i.editReply({content:response});
}

async function handleSelect(i,pm,guildId){
  const selected=i.values[0]; let response='';
  switch(selected){
    case 'shuffle': if(!pm.queueSize) response='❌ The queue is empty.'; else {await pm.shuffleQueue();response='🔀 Queue shuffled.';} break;
    case 'loop_off': await pm.setRepeatMode('off');response='➡️ Loop disabled.';break;
    case 'loop_track': await pm.setRepeatMode('track');response='🔂 Current track will repeat.';break;
    case 'loop_queue': await pm.setRepeatMode('queue');response='🔁 Queue will repeat.';break;
    case 'volume_down': {const v=Math.max(0,pm.volume-10);await pm.setVolume(v);response='🔉 Volume: **'+v+'%**';break;}
    case 'volume_up': {const v=Math.min(100,pm.volume+10);await pm.setVolume(v);response='🔊 Volume: **'+v+'%**';break;}
    case 'autoplay': {const s=db.guild.getMusicSettings(guildId);db.guild.setAutoplay(guildId,!s.autoplay);pm.player?.set?.('autoplayEnabled',!s.autoplay);response='🔄 Autoplay **'+(!s.autoplay?'enabled':'disabled')+'**.';break;}
    case 'settings': response='⚙️ Use `.settings` to open the interactive music settings panel.';break;
    default: response='❌ Unknown music option.';
  }
  await i.editReply({content:response});
}

export function createMusicPlayerComponents(settings,paused=false){
  const menu=new StringSelectMenuBuilder().setCustomId('music_player_select').setPlaceholder('🎛️ Music controls & settings').addOptions(
    {label:'Queue',description:'View the current music queue',value:'queue',emoji:'📜'},
    {label:'Shuffle',description:'Shuffle the queue',value:'shuffle',emoji:'🔀'},
    {label:'Loop Off',description:'Disable repeat',value:'loop_off',emoji:'➡️'},
    {label:'Loop Track',description:'Repeat the current track',value:'loop_track',emoji:'🔂'},
    {label:'Loop Queue',description:'Repeat the whole queue',value:'loop_queue',emoji:'🔁'},
    {label:'Volume Down',description:'Decrease volume',value:'volume_down',emoji:'🔉'},
    {label:'Volume Up',description:'Increase volume',value:'volume_up',emoji:'🔊'},
    {label:'Autoplay',description:'Toggle automatic continuation',value:'autoplay',emoji:'🔄'},
    {label:'Server Settings',description:'Open music configuration',value:'settings',emoji:'⚙️'}
  );
  const buttons=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_previous').setEmoji('⏮️').setLabel('Previous').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_pause').setEmoji(paused?'▶️':'⏸️').setLabel(paused?'Resume':'Pause').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setLabel('Skip').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Danger)
  );
  return [new ActionRowBuilder().addComponents(menu),buttons];
}

export function createMusicPlayerV2(track,settings,paused=false){
  const title=track?.info?.title||'Unknown title'; const author=track?.info?.author||'Unknown artist';
  const duration=track?.info?.duration?formatDuration(track.info.duration):'LIVE'; const source=track?.info?.sourceName||'Unknown';
  const c=new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('🎵 **AeroX Music Player**'),new TextDisplayBuilder().setContent('**'+title+'**\n🎤 '+author+'\n⏱️ '+duration+'  •  🎶 '+source));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('🔄 Autoplay: **'+(settings.autoplay?'ON':'OFF')+'**  •  👑 DJ: **'+(settings.djRole?'ON':'OFF')+'**\n📢 Announcements: **'+(settings.announceSongs?'ON':'OFF')+'**  •  ⏯️ Status: **'+(paused?'Paused':'Playing')+'**'));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  for(const row of createMusicPlayerComponents(settings,paused)) c.addActionRowComponents(row);
  return c;
}

function formatDuration(ms){const s=Math.floor(ms/1000),sec=String(s%60).padStart(2,'0'),min=Math.floor(s/60)%60,hr=Math.floor(s/3600);return hr?hr+':'+String(min).padStart(2,'0')+':'+sec:min+':'+sec;}