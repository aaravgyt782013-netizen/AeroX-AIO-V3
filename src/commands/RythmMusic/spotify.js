import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { command, context, getArgs, reply, safeReply } from "#utils/RythmCommands";
import { SpotifyCatalog } from "#managers/SpotifyCatalog";
import { config } from "#config/config";

const catalog = new SpotifyCatalog(config.spotify);

function trackButton(track, index) {
  return new ButtonBuilder()
    .setLabel(("Open " + (index + 1) + ": " + track.name).slice(0, 80))
    .setStyle(ButtonStyle.Link)
    .setURL(track.url);
}

async function run(x) {
  const c = context(x);
  const query = x.interaction?.options?.getString("query") || getArgs(x).join(" ").trim();
  if (!query) return safeReply(x, "🟢 Spotify", "Usage: .spotify <song name, Spotify track URL, or playlist URL>");

  try {
    const result = await catalog.inspect(query);
    if (result.kind === "track") {
      const t = result.track;
      const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle(t.name)
        .setURL(t.url)
        .setDescription("**Artist:** " + t.artists + "\\n**Album:** " + t.album + "\\n**Duration:** " + t.duration + "\\n\\nSpotify provides catalog information and links here; this command does not stream Spotify audio into Discord.")
        .setFooter({ text: "Spotify • LightCore" });
      return reply(x, { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Open in Spotify").setStyle(ButtonStyle.Link).setURL(t.url))] });
    }

    if (result.kind === "playlist") {
      const p = result.playlist;
      const list = p.tracks.length ? p.tracks.map((t, i) => (i + 1) + ". **" + t.name + "** — " + t.artists + " (" + t.duration + ")").join("\\n") : "No track details were returned.";
      const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle(p.name)
        .setURL(p.url)
        .setDescription("**Owner:** " + p.owner + "\\n**Tracks in playlist:** " + p.total + "\\n\\n" + list + "\\n\\nSpotify catalog details only; audio is not streamed into Discord.")
        .setFooter({ text: "Showing up to 10 tracks • Spotify • LightCore" });
      return reply(x, { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Open playlist in Spotify").setStyle(ButtonStyle.Link).setURL(p.url))] });
    }

    if (!result.tracks.length) return safeReply(x, "🟢 Spotify Search", "No matching tracks were found.");
    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle("Spotify search results")
      .setDescription(result.tracks.map((t, i) => "**" + (i + 1) + ". [" + t.name + "](" + t.url + ")**\\n" + t.artists + " • " + t.duration + " • " + t.album).join("\\n\\n"))
      .setFooter({ text: "Choose a result to open in Spotify • LightCore" });
    const row = new ActionRowBuilder().addComponents(result.tracks.filter(t => t.url).slice(0, 5).map(trackButton));
    return reply(x, { embeds: [embed], components: row.components.length ? [row] : [] });
  } catch (error) {
    return safeReply(x, "⚠️ Spotify", error?.message || "Spotify lookup failed.", 0xED4245);
  }
}

export default command({
  name: "spotify",
  description: "Search Spotify or inspect a Spotify track/playlist link",
  aliases: ["sp"],
  options: [{ name: "query", description: "Song name or Spotify track/playlist URL", type: 3, required: true }],
  execute: run,
  slashExecute: run
});
