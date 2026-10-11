/**
 * Source resolver for Discord voice playback.
 *
 * Spotify catalog lookup is intentionally handled by SpotifyCatalog.js. Spotify
 * links are not forwarded to a different streaming provider; the Spotify API
 * is used for metadata and official links only. Audio playback remains separate.
 */
const SEARCH_ORDER = ["ytmsearch", "ytsearch", "scsearch"];
const URL_PATTERN = /^https?:\/\//i;
const SPOTIFY_URL_PATTERN = /^(?:https?:\/\/(?:open\.)?spotify\.com\/(?:track|playlist)\/|spotify:(?:track|playlist):)/i;
const SEARCH_TIMEOUT_MS = 11000;

const isTrack = track => Boolean(track && (track.encoded || track.track || track.info?.identifier || track.info?.uri));

function normalizeSource(source) {
  const value = String(source || "").trim().toLowerCase();
  const aliases = {
    youtube: "ytsearch", yt: "ytsearch",
    ytmusic: "ytmsearch", ytm: "ytmsearch", "youtube music": "ytmsearch",
    soundcloud: "scsearch", sc: "scsearch"
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
    : loadType === "playlist" ? "playlist"
      : loadType === "search" || loadType === "search_result" ? "search"
        : (tracks.length > 1 ? "search" : "track");
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

  async search(query, { source = "ytmsearch", requester, isUrl = false } = {}) {
    const q = String(query || "").trim();
    if (!q) throw new Error("Type a song name or paste a supported audio URL.");
    if (SPOTIFY_URL_PATTERN.test(q)) {
      throw new Error("Spotify links cannot be streamed directly into Discord. Use .spotify <link> for Spotify details, or .play <song title> to search a supported audio source.");
    }
    if (!this.manager) throw new Error("LightCore's music engine is still starting. Try again in a few seconds.");

    const directUrl = Boolean(isUrl || URL_PATTERN.test(q));
    const requested = normalizeSource(source);
    const preferred = requested === "spsearch" || requested === "spotify" ? "ytmsearch" : requested || "ytmsearch";
    if (!SEARCH_ORDER.includes(preferred)) {
      throw new Error("Unsupported playback source. Choose YouTube Music, YouTube, or SoundCloud.");
    }

    // MusicEngine.search already tries the configured provider fallbacks for text queries.
    // Calling it once avoids repeating the same three-provider cascade in this resolver.
    const providers = [preferred];
    const failures = [];
    for (const provider of providers) {
      try {
        let raw = directUrl
          ? await withTimeout(this.manager.resolve(q, { source: provider, requester }), SEARCH_TIMEOUT_MS, provider)
          : await withTimeout(this.manager.search(q, { source: provider, requester }), SEARCH_TIMEOUT_MS, provider);
        let result = normalizeResult(raw);

        if ((!result || !result.tracks.length) && typeof this.manager.waitForNode === "function") {
          const nodes = await this.manager.waitForNode(2500);
          const restProviders = directUrl ? [preferred] : SEARCH_ORDER;
          for (const restProvider of restProviders) {
            let found = false;
            for (const node of nodes || []) {
              try {
                const identifier = directUrl ? q : restProvider + ":" + q;
                const direct = await withTimeout(
                  node.request("/loadtracks?identifier=" + encodeURIComponent(identifier)),
                  SEARCH_TIMEOUT_MS,
                  restProvider + " REST"
                );
                const normalized = normalizeResult(direct);
                if (normalized?.tracks?.length) { result = normalized; found = true; break; }
              } catch (error) {
                failures.push(restProvider + " REST: " + String(error?.message || "failed").slice(0, 100));
              }
            }
            if (found) break;
          }
        }
        if (result?.tracks?.length) return { ...result, tracks: result.tracks, searchSource: provider };
        failures.push(provider + ": no playable tracks");
      } catch (error) {
        failures.push(provider + ": " + String(error?.message || "search failed").slice(0, 120));
      }
    }

    if (directUrl) throw new Error("I couldn't load that URL from the configured Lavalink node. Try a supported audio URL or search by song title.");
    throw new Error("I couldn't find a playable result for **" + q.slice(0, 100) + "**. Tried " + providers.join(", ") + ". Check that the Lavalink node and its source plugins are available.");
  }
}
