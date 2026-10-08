import { EmbedBuilder } from "discord.js";
import { getPlayer, djError, nowPlayingEmbed, queueEmbed, controlRows } from "#utils/MusicCore";

export function createMusicPlayerV2(track, settings, paused=false, position=0) {
  const fake={ currentTrack:track, isPaused:paused, position, volume:settings?.volume??100, repeatMode:"off", queueSize:0 };
  return controlRows(fake);
}

export default {
  name:"interactionCreate",
  once:false,
  async execute(interaction, client) {
    if (!interaction.isButton?.() && !interaction.isStringSelectMenu?.()) return;
    if (!interaction.customId.startsWith("lc_music_")) return;
    const p=getPlayer({interaction,client});
    if (!p) return interaction.reply({content:"❌ No active music player.",ephemeral:true});
    const needsDJ=["lc_music_pause","lc_music_skip","lc_music_stop","lc_music_previous","lc_music_rewind","lc_music_forward","lc_music_shuffle","lc_music_loop","lc_music_volume_down","lc_music_volume_up","lc_music_search_select"].includes(interaction.customId);
    if (needsDJ) {
      const e=djError({interaction,client});
      if (e) return interaction.reply({content:"❌ "+e,ephemeral:true});
    }
    try {
      if (interaction.isStringSelectMenu?.() && interaction.customId === "lc_music_search_select") {
        const index=Number(interaction.values[0]);
        const session=p.player?.get?.("searchSession");
        if (!session || session.userId !== interaction.user.id || !session.tracks?.[index]) return interaction.reply({content:"❌ Search session expired. Run search again.",ephemeral:true});
        await p.addTracks(session.tracks[index]);
        if (!p.currentTrack) await p.play();
        return interaction.update({content:"✅ Added **"+(session.tracks[index].info.title||"track")+"** to the queue.",embeds:[],components:[]});
      }
      switch(interaction.customId) {
        case "lc_music_previous": if (!await p.playPrevious()) return interaction.reply({content:"❌ No previous track is available.",ephemeral:true}); break;
        case "lc_music_pause": if(p.isPaused) await p.resume(); else await p.pause(); break;
        case "lc_music_rewind": await p.rewind(10000); break;
        case "lc_music_forward": await p.forward(10000); break;
        case "lc_music_skip": await p.skip(); break;
        case "lc_music_stop": await p.stop(); return interaction.update({content:"⏹️ **Playback stopped.**",embeds:[],components:[]});
        case "lc_music_shuffle": await p.shuffleQueue(); break;
        case "lc_music_loop": await p.setRepeatMode(p.repeatMode==="track"?"off":"track"); break;
        case "lc_music_volume_down": await p.setVolume(Math.max(1,(p.volume??100)-10)); break;
        case "lc_music_volume_up": await p.setVolume(Math.min(200,(p.volume??100)+10)); break;
        case "lc_music_queue": return interaction.reply({embeds:[queueEmbed(p,1)],ephemeral:true});
      }
      await interaction.update({embeds:[nowPlayingEmbed(p)],components:controlRows(p)});
    } catch(e) {
      if (interaction.replied || interaction.deferred) return interaction.followUp({content:"❌ "+e.message,ephemeral:true}).catch(()=>{});
      return interaction.reply({content:"❌ "+e.message,ephemeral:true}).catch(()=>{});
    }
  }
};
