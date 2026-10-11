import { EmbedBuilder } from "discord.js";
import { command, context, getArgs, getPlayer, resolveTrack, enqueue, safeReply, reply } from "#utils/RythmCommands";

const normalize = value => String(value || "").trim().toLowerCase();
const getOwned = (client, userId, name) =>
  client.db.playlists.getUserPlaylists(userId).find(item => normalize(item.name) === normalize(name));

async function run(x) {
  const c = context(x);
  if (!c.guild) return safeReply(x, "🎵 LightCore Playlists", "Playlists can only be used in a server.", 0xED4245);
  const args = getArgs(x).slice();
  const action = String(x.interaction?.options?.getString("action") || args.shift() || "list").toLowerCase();
  const name = String(x.interaction?.options?.getString("name") || args.join(" ")).trim();
  const store = c.client.db?.playlists;
  if (!store) return safeReply(x, "🎵 LightCore Playlists", "The playlist database is unavailable.", 0xED4245);

  try {
    if (action === "list") {
      const lists = store.getUserPlaylists(c.user.id);
      if (!lists.length) return safeReply(x, "🎵 Your Playlists", "You have no saved playlists. Use .playlist create <name>.");
      const description = lists.slice(0, 20).map((p, i) =>
        "**" + (i + 1) + ". " + p.name + "** — " + (p.track_count || p.tracks.length) + " tracks"
      ).join("\n");
      return reply(x, { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("🎵 LightCore • Your Playlists").setDescription(description).setFooter({ text: "Private to your Discord account" })] });
    }

    if (!name) return safeReply(x, "🎵 LightCore Playlists", "Usage: .playlist <create|save|add|load|delete|clear|list> <name>", 0xED4245);

    if (action === "create") {
      const playlist = store.createPlaylist(c.user.id, name);
      return safeReply(x, "🎵 Playlist Created", "Created **" + playlist.name + "**. Add the current track with .playlist add " + playlist.name + ".");
    }

    if (action === "delete") {
      const playlist = getOwned(c.client, c.user.id, name);
      if (!playlist) return safeReply(x, "🎵 Playlist", "I couldn't find a playlist with that name in your account.", 0xED4245);
      store.deletePlaylist(playlist.id, c.user.id);
      return safeReply(x, "🗑️ Playlist Deleted", "Deleted **" + playlist.name + "**.");
    }

    if (action === "clear") {
      const playlist = getOwned(c.client, c.user.id, name);
      if (!playlist) return safeReply(x, "🎵 Playlist", "I couldn't find a playlist with that name in your account.", 0xED4245);
      store.clearPlaylist(playlist.id, c.user.id);
      return safeReply(x, "🧹 Playlist Cleared", "Removed all tracks from **" + playlist.name + "**.");
    }

    if (action === "add" || action === "save") {
      const player = getPlayer(x);
      const current = player?.currentTrack;
      if (!current?.info) return safeReply(x, "🎵 Playlist", "Start a track first, then use .playlist add <name>.", 0xED4245);
      let playlist = getOwned(c.client, c.user.id, name);
      if (!playlist && action === "save") playlist = store.createPlaylist(c.user.id, name);
      if (!playlist) return safeReply(x, "🎵 Playlist", "Create that playlist first with .playlist create <name>.", 0xED4245);
      const info = current.info;
      store.addTrackToPlaylist(playlist.id, c.user.id, {
        identifier: info.identifier || info.uri || (info.title + "-" + info.author),
        title: info.title, author: info.author, uri: info.uri,
        duration: info.duration, sourceName: info.sourceName, artworkUrl: info.artworkUrl
      });
      return safeReply(x, "➕ Track Saved", "Added **" + (info.title || "Unknown track") + "** to **" + playlist.name + "**.");
    }

    if (action === "load" || action === "play") {
      const playlist = getOwned(c.client, c.user.id, name);
      if (!playlist) return safeReply(x, "🎵 Playlist", "I couldn't find a playlist with that name in your account.", 0xED4245);
      if (!playlist.tracks?.length) return safeReply(x, "🎵 Playlist", "**" + playlist.name + "** is empty.", 0xED4245);
      let added = 0;
      const errors = [];
      for (const saved of playlist.tracks.slice(0, 50)) {
        try {
          const query = saved.uri || [saved.author, saved.title].filter(Boolean).join(" ");
          const result = await resolveTrack(x, query);
          await enqueue(x, { ...result, loadType: "track", tracks: result.tracks.slice(0, 1) });
          added++;
        } catch (error) {
          errors.push(saved.title || "Unknown track");
        }
      }
      const detail = errors.length ? "\nSkipped " + errors.length + " unavailable track(s)." : "";
      return safeReply(x, "🎵 Playlist Loaded", "Added **" + added + "** track(s) from **" + playlist.name + "**." + detail, added ? 0x57F287 : 0xED4245);
    }

    return safeReply(x, "🎵 LightCore Playlists", "Actions: create, save, add, load, delete, clear, list.", 0xED4245);
  } catch (error) {
    return safeReply(x, "⚠️ LightCore Playlists", error?.message || "Playlist operation failed.", 0xED4245);
  }
}

export default command({
  name: "playlist",
  description: "Create, save, load, and manage your personal music playlists",
  aliases: ["pl", "playlists"],
  options: [
    { name: "action", description: "Playlist action", type: 3, required: true, choices: ["list", "create", "save", "add", "load", "delete", "clear"].map(value => ({ name: value, value })) },
    { name: "name", description: "Playlist name", type: 3, required: false }
  ],
  execute: run,
  slashExecute: run
});
