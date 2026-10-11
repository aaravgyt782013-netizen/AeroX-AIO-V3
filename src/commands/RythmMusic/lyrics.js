import { EmbedBuilder } from "discord.js";
import { command, context, getArgs, getPlayer, safeReply, reply } from "#utils/RythmCommands";

const MAX_LYRICS = 3800;
const clean = value => String(value || "").replace(/\s+/g, " ").trim();

async function findLyrics(query, track) {
  const search = clean(query || [track?.info?.title, track?.info?.author].filter(Boolean).join(" "));
  if (!search) throw new Error("Give a song title, or start a track and run .lyrics.");
  const response = await fetch(
    "https://lrclib.net/api/search?q=" + encodeURIComponent(search),
    { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "LightCore Discord Music Bot" } }
  );
  if (!response.ok) throw new Error("The lyrics provider is temporarily unavailable. Try again shortly.");
  const results = await response.json();
  const match = Array.isArray(results) ? results.find(item => item.plainLyrics || item.syncedLyrics) : null;
  if (!match) throw new Error("Lyrics were not found for that track.");
  return {
    title: clean(match.trackName) || search,
    artist: clean(match.artistName),
    lyrics: String(match.plainLyrics || match.syncedLyrics || "").trim()
  };
}

async function run(x) {
  const query = x.interaction?.options?.getString("query") || getArgs(x).join(" ").trim();
  const player = getPlayer(x);
  try {
    const result = await findLyrics(query, player?.currentTrack);
    const description = result.lyrics.length > MAX_LYRICS
      ? result.lyrics.slice(0, MAX_LYRICS) + "\n\n…Lyrics shortened to fit Discord's message limit."
      : result.lyrics;
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(("🎤 " + result.title + " • Lyrics").slice(0, 256))
      .setDescription(description)
      .setFooter({ text: "LightCore • Lyrics by LRCLIB" });
    if (result.artist) embed.setAuthor({ name: result.artist.slice(0, 256) });
    return reply(x, { embeds: [embed] });
  } catch (error) {
    return safeReply(x, "🎤 LightCore Lyrics", error?.message || "Lyrics lookup failed.", 0xED4245);
  }
}

export default command({
  name: "lyrics",
  description: "Find lyrics for a song or the currently playing track",
  aliases: ["lyric", "ly"],
  options: [{ name: "query", description: "Song title (optional)", type: 3, required: false }],
  execute: run,
  slashExecute: run
});
