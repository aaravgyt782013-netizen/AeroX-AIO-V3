/**
 * Resilient search and track resolution for AeroX / LightCore.
 * Keeps direct URLs exact, bounds provider latency, and normalizes Lavalink
 * responses so commands fail with a useful message instead of hanging.
 */
const SEARCH_ORDER = ["ytmsearch", "ytsearch", "scsearch", "spsearch"];
const URL_PATTERN = /^https?:\/\//i;
const SEARCH_TIMEOUT_MS = 12000;
const hasPlayableTrack = track => Boolean(
  track && (track.encoded || track.track || track.info?.identifier || track.info?.uri)
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

function withTimeout(promise, ms, provider) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(provider + " search timed out.")), ms);
    })
  ]).finally(() => clearTimeout(timer));
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
    if (!SEARCH_ORDER.includes(preferred)) {
      throw new Error("Unsupported music source. Choose YouTube Music, YouTube, SoundCloud, or Spotify.");
    }

    // Never turn a URL into a different song search: resolve it exactly.
    const providers = directUrl ? [preferred] : [...new Set([preferred, ...SEARCH_ORDER])];
    const failures = [];

    for (const provider of providers) {
      try {
        const operation = directUrl
          ? this.manager.resolve(q, { source: provider, requester })
          : this.manager.search(q, { source: provider, requester });
        const result = await withTimeout(operation, SEARCH_TIMEOUT_MS, provider);
        const tracks = getTracks(result);
        if (tracks.length) {
          return { ...result, tracks, searchSource: provider };
        }

        const loadType = String(result?.loadType || "empty").toLowerCase();
        failures.push(provider + ": " + (loadType === "error" ? "provider returned an error" : "no playable tracks"));
      } catch (error) {
        failures.push(provider + ": " + String(error?.message || "search failed").slice(0, 140));
      }
    }

    if (directUrl) {
      throw new Error("That URL could not be loaded by the configured Lavalink node. Confirm the source is supported and its Lavalink plugin is enabled.");
    }
    throw new Error("No playable results were found. Tried " + providers.join(", ") + ". " + failures.slice(0, 2).join("; "));
  }
}
