/**
 * LightCore music search and track resolver.
 * Tries the most reliable YouTube search first, then YouTube Music and
 * secondary providers. Normalizes Lavalink v4 and lavalink-client response
 * shapes so commands never mistake valid results for an empty search.
 */
const SEARCH_ORDER = ["ytsearch", "ytmsearch", "scsearch", "spsearch"];
const URL_PATTERN = /^https?:\/\//i;
const SEARCH_TIMEOUT_MS = 11000;

const isTrack = track => Boolean(
  track && (track.encoded || track.track || track.info?.identifier || track.info?.uri)
);

function normalizeSource(source) {
  const value = String(source || "").trim().toLowerCase();
  const aliases = {
    youtube: "ytsearch", yt: "ytsearch",
    ytmusic: "ytmsearch", ytm: "ytmsearch", "youtube music": "ytmsearch",
    soundcloud: "scsearch", sc: "scsearch",
    spotify: "spsearch", sp: "spsearch"
  };
  return aliases[value] || value;
}

function normalizeResult(result) {
  if (!result || typeof result !== "object") return null;
  const loadType = String(result.loadType || result.load_type || "").toLowerCase();
  let tracks = Array.isArray(result.tracks) ? result.tracks : [];
  if (!tracks.length && Array.isArray(result.data)) tracks = result.data;
  if (!tracks.length && result.data && Array.isArray(result.data.tracks)) tracks = result.data.tracks;
  if (!tracks.length && result.data && typeof result.data === "object" && isTrack(result.data)) tracks = [result.data];
  tracks = tracks.filter(isTrack);
  if (!tracks.length) return { ...result, loadType, tracks: [] };
  const normalizedType = loadType === "track" || loadType === "loaded" ? "track"
    : loadType === "playlist" || loadType === "search" || loadType === "search_result"
      ? loadType : (tracks.length > 1 ? "search" : "track");
  return { ...result, loadType: normalizedType, tracks };
}

function withTimeout(promise, ms, provider) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(provider + " search timed out.")), ms); })
  ]).finally(() => clearTimeout(timer));
}

export class MusicSearchEngine {
  constructor(manager) { this.manager = manager; }

  async search(query, { source = "ytsearch", requester, isUrl = false } = {}) {
    const q = String(query || "").trim();
    if (!q) throw new Error("Type a song name or paste a supported music URL.");
    if (!this.manager) throw new Error("LightCore's music engine is still starting. Try again in a few seconds.");

    const directUrl = Boolean(isUrl || URL_PATTERN.test(q));
    const preferred = normalizeSource(source) || "ytsearch";
    if (!SEARCH_ORDER.includes(preferred)) {
      throw new Error("Unsupported source. Choose YouTube, YouTube Music, SoundCloud, or Spotify.");
    }

    // For text queries, never let a provider with disabled plugins block the
    // whole request. Try independent providers in a predictable order.
    const providers = directUrl ? [preferred] : [...new Set([preferred, ...SEARCH_ORDER])];
    const failures = [];

    for (const provider of providers) {
      try {
        let raw;
        if (directUrl) {
          raw = await withTimeout(this.manager.resolve(q, { source: provider, requester }), SEARCH_TIMEOUT_MS, provider);
        } else {
          raw = await withTimeout(this.manager.search(q, { source: provider, requester }), SEARCH_TIMEOUT_MS, provider);
        }
        let result = normalizeResult(raw);

        // MusicEngine already includes a Lavalink REST fallback. If its
        // wrapper returns null/empty, try the node API directly when available.
        if ((!result || !result.tracks.length) && typeof this.manager.waitForNode === "function") {
          const nodes = await this.manager.waitForNode(2500);
          for (const node of nodes || []) {
            try {
              const identifier = directUrl ? q : provider + ":" + q;
              const direct = await withTimeout(
                node.request("/loadtracks?identifier=" + encodeURIComponent(identifier)),
                SEARCH_TIMEOUT_MS,
                provider + " REST"
              );
              const normalized = normalizeResult(direct);
              if (normalized?.tracks?.length) { result = normalized; break; }
            } catch (error) {
              failures.push(provider + " REST: " + String(error?.message || "failed").slice(0, 100));
            }
          }
        }

        if (result?.tracks?.length) return { ...result, tracks: result.tracks, searchSource: provider };
        failures.push(provider + ": no playable tracks");
      } catch (error) {
        failures.push(provider + ": " + String(error?.message || "search failed").slice(0, 120));
      }
    }

    if (directUrl) {
      throw new Error("I couldn't load that URL from the configured Lavalink node. Try a YouTube or SoundCloud link, or search by song title.");
    }
    throw new Error(
      "I couldn't find a playable result for **" + q.slice(0, 100) + "**. " +
      "Tried " + providers.join(", ") + ". Check that the Lavalink node is connected and its YouTube/SoundCloud plugins are enabled."
    );
  }
}
