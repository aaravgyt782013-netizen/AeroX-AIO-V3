/**
 * Resilient search and track resolution for AeroX / LightCore.
 *
 * Search failures are isolated per provider so a disabled source does not
 * prevent the next source from being tried. Direct URLs are resolved once;
 * retrying a URL as a search query can return unrelated tracks.
 */
const SEARCH_ORDER = ["ytmsearch", "ytsearch", "scsearch"];
const isHttpUrl = value => /^https?:\/\//i.test(value);
const hasPlayableTrack = track => Boolean(track && (track.encoded || track.info?.identifier || track.info?.uri));

function normalizeSource(source) {
  const value = String(source || "").trim().toLowerCase();
  const aliases = {
    youtube: "ytsearch",
    yt: "ytsearch",
    ytmusic: "ytmsearch",
    "youtube music": "ytmsearch",
    soundcloud: "scsearch",
    sc: "scsearch",
    spotify: "spsearch"
  };
  return aliases[value] || value;
}

export class MusicSearchEngine {
  constructor(manager) {
    this.manager = manager;
  }

  async search(query, { source = "ytmsearch", requester, isUrl = false } = {}) {
    const q = String(query || "").trim();
    if (!q) throw new Error("Give me a song name or URL.");
    if (!this.manager) throw new Error("The music engine is not initialized yet. Please try again shortly.");

    const directUrl = isUrl || isHttpUrl(q);
    const preferred = normalizeSource(source) || "ytmsearch";
    const sources = directUrl
      ? [preferred]
      : [...new Set([preferred, ...SEARCH_ORDER])];
    const failures = [];

    for (const provider of sources) {
      try {
        const result = directUrl
          ? await this.manager.resolve(q, { source: provider, requester })
          : await this.manager.search(q, { source: provider, requester });

        const tracks = Array.isArray(result?.tracks)
          ? result.tracks.filter(hasPlayableTrack)
          : [];

        if (tracks.length) {
          return { ...result, tracks, searchSource: provider };
        }

        const loadType = String(result?.loadType || "empty").toLowerCase();
        failures.push(provider + ": " + (loadType === "error" ? "provider returned an error" : "no playable tracks"));
      } catch (error) {
        failures.push(provider + ": " + (error?.message || "search failed"));
      }
    }

    const attempted = failures.map(item => item.split(":")[0]).join(", ");
    const prefix = directUrl
      ? "That link could not be resolved by the configured Lavalink node."
      : "No playable results were found.";
    throw new Error(prefix + (attempted ? " Sources tried: " + attempted + "." : ""));
  }
}
