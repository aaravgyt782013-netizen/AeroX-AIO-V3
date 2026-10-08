import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import {
  getPlayer,
  djError,
  nowPlayingEmbed,
  queueEmbed,
  musicSettings,
  settingsContainer,
  settingsRows,
  sourceMenu,
  v2Payload
} from "#utils/MusicCore";

function canManage(interaction) {
  return Boolean(
    interaction.member?.permissions?.has("Administrator") ||
    interaction.member?.permissions?.has("ManageGuild")
  );
}

async function updateSettings(interaction, notice = "") {
  const settings = musicSettings({ interaction, client: interaction.client });
  return interaction.update(v2Payload(settingsContainer(settings, notice)));
}

export function createMusicPlayerV2(track, settings, paused = false, position = 0) {
  return nowPlayingEmbed({
    currentTrack: track,
    isPaused: paused,
    position,
    volume: settings?.volume ?? 100,
    repeatMode: "off",
    queueSize: 0
  });
}

export default {
  name: "interactionCreate",
  once: false,

  async execute(interaction, client) {
    if (!interaction.isButton?.() && !interaction.isStringSelectMenu?.() && !interaction.isModalSubmit?.()) return;
    if (!interaction.customId?.startsWith("lc_music_")) return;

    const id = interaction.customId;

    if (id.startsWith("lc_music_setting_") || id === "lc_music_source_select") {
      if (!canManage(interaction)) {
        return interaction.reply(v2Payload(settingsContainer(
          musicSettings({ interaction, client }),
          "You need Manage Server to change music settings."
        )));
      }

      try {
        if (interaction.isStringSelectMenu() && id === "lc_music_source_select") {
          const source = interaction.values[0];
          db.setMusicSettings(interaction.guild.id, { source });
          return updateSettings(interaction, "Music source updated");
        }

        if (interaction.isButton() && id === "lc_music_setting_source") {
          const container = settingsContainer(musicSettings({ interaction, client }), "Choose the default search source below.");
          // Put the source menu in its own V2 message so Discord never receives an embed/content with Components V2.
          container.addActionRowComponents(sourceMenu());
          return interaction.reply(v2Payload(container, { ephemeral: true }));
        }

        if (interaction.isButton() && id === "lc_music_setting_dj") {
          const modal = new ModalBuilder()
            .setCustomId("lc_music_setting_dj_modal")
            .setTitle("Set LightCore DJ Role");

          const input = new TextInputBuilder()
            .setCustomId("role_id")
            .setLabel("Role ID or @role (blank disables)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("123456789012345678");

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && id === "lc_music_setting_dj_modal") {
          const raw = interaction.fields.getTextInputValue("role_id").trim();
          const roleId = raw.match(/\d{15,25}/)?.[0] || null;
          if (roleId && !interaction.guild.roles.cache.has(roleId)) {
            return interaction.reply(v2Payload(settingsContainer(
              musicSettings({ interaction, client }),
              "That role was not found."
            ), { ephemeral: true }));
          }
          db.setDJRole(interaction.guild.id, roleId);
          return interaction.reply(v2Payload(
            settingsContainer(musicSettings({ interaction, client }), "DJ role updated"),
            { ephemeral: true }
          ));
        }

        const map = {
          lc_music_setting_autoplay: "autoplay",
          lc_music_setting_announce: "announceSongs",
          lc_music_setting_voteskip: "voteSkip",
          lc_music_setting_247: "mode247"
        };
        const key = map[id];
        if (key) {
          const current = musicSettings({ interaction, client });
          const enabled = !current[key];
          db.setMusicSettings(interaction.guild.id, { [key]: enabled });

          const player = client.music?.getPlayer?.(interaction.guild.id);
          if (key === "autoplay") {
            if (player) {
              player.set("autoplayEnabled", enabled);
              player.set("stayAlive", enabled);
              if (enabled) client.music?._refreshVoiceStayAlive?.(player, true);
            }
          }
          if (key === "mode247") {
            const voiceId = player?.voiceChannelId || interaction.member?.voice?.channelId || null;
            const textId = player?.textChannelId || interaction.channelId || null;
            if (enabled && voiceId) db.guild.set247Mode(interaction.guild.id, true, voiceId, textId);
            else if (!enabled) db.guild.set247Mode(interaction.guild.id, false);
            if (player) player.set("stayAlive", enabled || Boolean(musicSettings({ interaction, client }).autoplay));
          }

          return updateSettings(interaction, `${key === "mode247" ? "24/7" : key} ${enabled ? "enabled" : "disabled"}`);
        }

        return interaction.reply(v2Payload(settingsContainer(
          musicSettings({ interaction, client }),
          "Unknown music setting."
        ), { ephemeral: true }));
      } catch (error) {
        const message = "Could not update music settings: " + (error?.message || "unknown error");
        if (interaction.deferred || interaction.replied) {
          return interaction.followUp(v2Payload(settingsContainer(
            musicSettings({ interaction, client }), message
          ), { ephemeral: true })).catch(() => {});
        }
        return interaction.reply(v2Payload(settingsContainer(
          musicSettings({ interaction, client }), message
        ), { ephemeral: true })).catch(() => {});
      }
    }

    const p = getPlayer({ interaction, client });
    if (!p) {
      return interaction.reply(v2Payload(settingsContainer(
        musicSettings({ interaction, client }),
        "No active music player. Start playback with .play <song>."
      ), { ephemeral: true }));
    }

    const needsDJ = [
      "lc_music_pause","lc_music_skip","lc_music_stop","lc_music_previous",
      "lc_music_rewind","lc_music_forward","lc_music_shuffle","lc_music_loop",
      "lc_music_volume_down","lc_music_volume_up","lc_music_search_select"
    ].includes(id);

    if (needsDJ) {
      const error = djError({ interaction, client });
      if (error) return interaction.reply(v2Payload(settingsContainer(
        musicSettings({ interaction, client }),
        error
      ), { ephemeral: true }));
    }

    try {
      if (interaction.isStringSelectMenu() && id === "lc_music_search_select") {
        const index = Number(interaction.values[0]);
        const session = p.player?.get?.("searchSession");

        if (!session || session.userId !== interaction.user.id || !session.tracks?.[index]) {
          return interaction.reply(v2Payload(settingsContainer(
            musicSettings({ interaction, client }),
            "Search session expired. Run .search again."
          ), { ephemeral: true }));
        }

        await p.addTracks(session.tracks[index]);
        if (!p.currentTrack) await p.play();
        return interaction.update(v2Payload(nowPlayingEmbed(p)));
      }

      switch (id) {
        case "lc_music_previous":
          if (!await p.playPrevious()) return interaction.reply(v2Payload(nowPlayingEmbed(p), { ephemeral: true }));
          break;
        case "lc_music_pause":
          if (p.isPaused) await p.resume(); else await p.pause();
          break;
        case "lc_music_rewind":
          await p.rewind(10000);
          break;
        case "lc_music_forward":
          await p.forward(10000);
          break;
        case "lc_music_skip":
          await p.skip();
          break;
        case "lc_music_stop":
          await p.stop();
          return interaction.update(v2Payload(settingsContainer(musicSettings({ interaction, client }), "Playback stopped")));
        case "lc_music_shuffle":
          await p.shuffleQueue();
          break;
        case "lc_music_loop":
          await p.setRepeatMode(p.repeatMode === "track" ? "off" : "track");
          break;
        case "lc_music_volume_down":
          await p.setVolume(Math.max(1, (p.volume ?? 100) - 10));
          break;
        case "lc_music_volume_up":
          await p.setVolume(Math.min(200, (p.volume ?? 100) + 10));
          break;
        case "lc_music_queue":
          return interaction.reply(v2Payload(queueEmbed(p, 1), { ephemeral: true }));
        default:
          return;
      }

      return interaction.update(v2Payload(nowPlayingEmbed(p)));
    } catch (error) {
      const payload = v2Payload(settingsContainer(
        musicSettings({ interaction, client }),
        "Music action failed: " + (error?.message || "unknown error")
      ), { ephemeral: true });
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
      return interaction.reply(payload).catch(() => {});
    }
  }
};
