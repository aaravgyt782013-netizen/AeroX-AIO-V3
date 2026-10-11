import { EmbedBuilder } from "discord.js";
import { command, context, getArgs, getPlayer, safeReply, reply } from "#utils/RythmCommands";

const MAX_LYRICS = 3800;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function findLyrics(title, artist = "") {
  const parts = [clean(artist), clean(title)].filter(Boolean);
  if (!parts.length) throw new Error("Give a song title, or start a track and run .lyrics.");
  const response = await fetch(
    "https://api.lyrics.ovh/v1/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts.slice(1).join(" ")),
    { signal: AbortSignal.timeout(8000) }
  );
  if (!response.ok) {
    if (response.status === 404) throw new Error("Lyrics were not found for that track.");
    throw new Error("The lyrics provider is temporarily unavailable. Try again shortly.");
  }
  const data = await response.json();
  const text = String(data.lyrics || "").trim();
  if (!text) throw new Error("No lyrics were returned for that track.");
  return text;
}

async function run(x) {
  const c = context(x);
  const args = getArgs(x);
  const player = getPlayer(x);
  const query = x.interaction?.options?.getString("query") || args.join(" ").trim();
  const track = player?.currentTrack;
  const title = query || track?.info?.title || "";
  const artist = query ? "" : track?.info?.author || "";
  try {
    const lyrics = await findLyrics(title, artist);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(("🎤 Lyrics • " + title).slice(0, 256))
      .setDescription(lyrics.length > MAX_LYRICS ? lyrics.slice(0, MAX_LYRICS) + "\n\n…Lyrics truncated to fit Discord's message limit." : lyrics)
      .setFooter({ text: "LightCore • Lyrics provided by lyrics.ovh" });
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
