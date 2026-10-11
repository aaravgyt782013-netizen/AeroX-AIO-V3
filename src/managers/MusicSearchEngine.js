/**
 * Resilient search and track resolution for AeroX / LightCore.
 * Tries the requested provider first, then compatible fallbacks. Direct URLs
 * are never silently converted into text searches, which can play the wrong song.
 */
const SEARCH_ORDER = ["ytmsearch", "ytsearch", "scsearch"];
const URL_PATTERN = /^https?:\/\//i;
const hasPlayableTrack = track => Boolean(
  track && (track.encoded || track.info?.identifier || track.info?.uri)
);

function normalizeSource(source) {
  const value = String(source || "").trim().toLowerCase();
  const aliases = {
    youtube: "ytsearch", yt: "ytsearch",
    ytmusic: "ytmsearch", "youtube music": "ytmsearch",
    soundcloud: "scsearch", sc: "scsearch",
    spotify: "spsearch"
  };
  return aliases[value] || value;
}

function getTracks(result) {
  return Array.isArray(result?.tracks) ? result.tracks.filter(hasPlayableTrack) : [];
}

export class MusicSearchEngine {
  constructor(manager) {
    this.manager = manager;
  }

  async search(query, { source = "ytmsearch", requester, isUrl = false } = {}) {
    const q = String(query || "").trim();
    if (!q) throw new Error("Give me a song name or URL.");
    if (!this.manager) throw new Error("The music engine is not initialized yet. Please try again shortly.");

    const directUrl = Boolean(isUrl || URL_PATTERN.test(q));
    const preferred = normalizeSource(source) || "ytmsearch";
    const supported = new Set(["ytmsearch", "ytsearch", "scsearch", "spsearch"]);
    if (!supported.has(preferred)) {
      throw new Error("Unsupported music source. Choose YouTube Music, YouTube, SoundCloud, or Spotify.");
    }

    // URLs must be resolved as URLs exactly once. For text, keep the requested
    // provider first, then fall back to providers commonly enabled on Lavalink.
    const providers = directUrl
      ? [preferred]
      : [...new Set([preferred, ...SEARCH_ORDER, "spsearch"].filter(p => supported.has(p)))];
    const failures = [];

    for (const provider of providers) {
      try {
        const result = directUrl
          ? await this.manager.resolve(q, { source: provider, requester })
          : await this.manager.search(q, { source: provider, requester });
        const tracks = getTracks(result);
        if (tracks.length) {
          return { ...result, tracks, searchSource: provider };
        }

        const loadType = String(result?.loadType || "empty").toLowerCase();
        failures.push(provider + ": " + (loadType === "error" ? "source error" : "no playable tracks"));
      } catch (error) {
        failures.push(provider + ": " + String(error?.message || "search failed").slice(0, 180));
      }
    }

    const attempted = failures.map(item => item.split(":")[0]).join(", ");
    if (directUrl) {
      throw new Error("That link could not be resolved by the configured Lavalink node. Check that the link is supported and the node's source plugins are enabled.");
    }
    throw new Error("No playable results were found. Sources tried: " + (attempted || providers.join(", ")) + ".");
  }
}
