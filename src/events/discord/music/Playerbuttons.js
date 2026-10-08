import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { db } from "#database/DatabaseManager";
import {
  getPlayer,
  djError,
  sameVoiceError,
  nowPlayingEmbed,
  queueEmbed,
  musicSettings,
  settingsContainer,
  sourceMenu,
  v2Payload
} from "#utils/MusicCore";

function canManage(interaction) {
  return Boolean(
    interaction.member?.permissions?.has("Administrator") ||
    interaction.member?.permissions?.has("ManageGuild")
  );
}

function controlError(interaction, client, player) {
  return djError({ interaction, client }) || sameVoiceError({ interaction, client }, player);
}

async function updateSettings(interaction, client, notice = "") {
  return interaction.update(v2Payload(settingsContainer(musicSettings({ interaction, client }), notice)));
}

export function createMusicPlayerV2(track, settings, paused = false, position = 0) {
  const fakePlayer = {
    currentTrack: track,
    isPaused: paused,
    position,
    volume: settings?.volume ?? 100,
    repeatMode: "off",
    queueSize: 0,
    getData: key => key === "autoplayEnabled" ? Boolean(settings?.autoplay) : key === "stay247" ? Boolean(settings?.mode247) : false
  };
  return nowPlayingEmbed(fakePlayer);
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
        ), { ephemeral: true }));
      }

      try {
        if (interaction.isStringSelectMenu() && id === "lc_music_source_select") {
          db.guild.setMusicSettings(interaction.guild.id, { source: interaction.values[0] });
          return updateSettings(interaction, client, "Music source updated");
        }

        if (interaction.isButton() && id === "lc_music_setting_source") {
          const container = settingsContainer(musicSettings({ interaction, client }), "Choose the default search source below.");
          container.addActionRowComponents(sourceMenu());
          return interaction.reply(v2Payload(container, { ephemeral: true }));
        }

        if (interaction.isButton() && id === "lc_music_setting_dj") {
          const modal = new ModalBuilder().setCustomId("lc_music_setting_dj_modal").setTitle("Set LightCore DJ Role");
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
            return interaction.reply(v2Payload(settingsContainer(musicSettings({ interaction, client }), "That role was not found."), { ephemeral: true }));
          }
          db.guild.setDJRole(interaction.guild.id, roleId);
          return interaction.reply(v2Payload(settingsContainer(musicSettings({ interaction, client }), "DJ role updated"), { ephemeral: true }));
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
          db.guild.setMusicSettings(interaction.guild.id, { [key]: enabled });

          const player = client.music?.getPlayer?.(interaction.guild.id);

          if (key === "autoplay") {
            if (player) {
              player.set("autoplayEnabled", enabled);
              player.set("stayAlive", enabled || current.mode247);
              player.set("stay247", current.mode247);
              client.music?.refreshVoiceStayAlive?.(interaction.guild.id, true);
            }
          }

          if (key === "mode247") {
            const voiceId = player?.voiceChannelId || interaction.member?.voice?.channelId || null;
            const textId = player?.textChannelId || interaction.channelId || null;
            if (enabled) db.guild.set247Mode(interaction.guild.id, true, voiceId, textId);
            else db.guild.set247Mode(interaction.guild.id, false);
            if (player) {
              player.set("stay247", enabled);
              player.set("stayAlive", enabled || current.autoplay);
              client.music?.refreshVoiceStayAlive?.(interaction.guild.id, true);
            }
          }

          return updateSettings(
            interaction,
            client,
            key === "mode247" ? "24/7 " + (enabled ? "enabled" : "disabled") : key + " " + (enabled ? "enabled" : "disabled")
          );
        }

        return interaction.reply(v2Payload(settingsContainer(musicSettings({ interaction, client }), "Unknown music setting."), { ephemeral: true }));
      } catch (error) {
        const message = "Could not update music settings: " + (error?.message || "unknown error");
        const payload = v2Payload(settingsContainer(musicSettings({ interaction, client }), message), { ephemeral: true });
        if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
        return interaction.reply(payload).catch(() => {});
      }
    }

    const p = getPlayer({ interaction, client });
    if (!p) {
      return interaction.reply(v2Payload(
        settingsContainer(musicSettings({ interaction, client }), "No active music player. Start playback with .play <song>."),
        { ephemeral: true }
      ));
    }

    if (id === "lc_music_settings") {
      return interaction.reply(v2Payload(settingsContainer(musicSettings({ interaction, client }), "Music settings"), { ephemeral: true }));
    }

    if (id === "lc_music_queue") {
      const error = sameVoiceError({ interaction, client }, p);
      if (error) return interaction.reply(v2Payload(settingsContainer(musicSettings({ interaction, client }), error), { ephemeral: true }));
      return interaction.reply(v2Payload(queueEmbed(p, 1), { ephemeral: true }));
    }

    const needsControl = [
      "lc_music_pause", "lc_music_skip", "lc_music_stop", "lc_music_previous",
      "lc_music_rewind", "lc_music_forward", "lc_music_shuffle", "lc_music_loop",
      "lc_music_volume_down", "lc_music_volume_up", "lc_music_autoplay"
    ].includes(id);

    if (!needsControl) return;

    const error = controlError(interaction, client, p);
    if (error) {
      return interaction.reply(v2Payload(settingsContainer(musicSettings({ interaction, client }), error), { ephemeral: true }));
    }

    try {
      if (id === "lc_music_autoplay") {
        const current = musicSettings({ interaction, client });
        const enabled = !current.autoplay;
        db.guild.setAutoplay(interaction.guild.id, enabled);
        p.setData("autoplayEnabled", enabled);
        p.setData("stayAlive", enabled || current.mode247);
        client.music?.refreshVoiceStayAlive?.(interaction.guild.id, true);
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
          db.guild.setAutoplay(interaction.guild.id, false);
          db.guild.setMusicSettings(interaction.guild.id, { mode247: false });
          p.setData("autoplayEnabled", false);
          p.setData("stayAlive", false);
          p.setData("stay247", false);
          await p.stop();
          return interaction.update(v2Payload(settingsContainer(musicSettings({ interaction, client }), "Playback stopped. Autoplay and 24/7 are now off.")));
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
      }

      return interaction.update(v2Payload(nowPlayingEmbed(p)));
    } catch (error) {
      const payload = v2Payload(
        settingsContainer(musicSettings({ interaction, client }), "Music action failed: " + (error?.message || "unknown error")),
        { ephemeral: true }
      );
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
      return interaction.reply(payload).catch(() => {});
    }
  }
};
