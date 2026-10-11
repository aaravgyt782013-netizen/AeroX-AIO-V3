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
const SEARCH_TIMEOUT_MS = 12000;

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
    if (!this.manager) throw new Error("LightCore's music engine is still starting. Try again in a few seconds.");

    const requested = normalizeSource(source);
    const preferred = requested === "spsearch" || requested === "spotify" ? "ytmsearch" : requested || "ytmsearch";
    if (!SEARCH_ORDER.includes(preferred)) {
      throw new Error("Unsupported playback source. Choose YouTube Music, YouTube, or SoundCloud.");
    }

    // Spotify is a catalogue, not a Discord audio stream. Match its metadata to
    // playable tracks on the configured Lavalink sources instead of rejecting
    // links or pretending Spotify audio can be streamed directly.
    if (SPOTIFY_URL_PATTERN.test(q)) {
      const { SpotifyCatalog } = await import("#managers/SpotifyCatalog");
      const { config } = await import("#config/config");
      const catalog = new SpotifyCatalog(config.spotify);
      const item = await withTimeout(catalog.inspect(q), SEARCH_TIMEOUT_MS, "Spotify catalogue lookup");
      const items = item.kind === "track" ? [item.track]
        : item.kind === "playlist" ? item.playlist.tracks : [];
      if (!items.length) throw new Error("No Spotify tracks were returned for matching.");

      const matchOne = async track => {
        const searchQuery = [track.artists, track.name].filter(Boolean).join(" ").trim();
        if (!searchQuery) return null;
        const raw = await withTimeout(
          this.manager.search(searchQuery, { source: preferred, requester }),
          SEARCH_TIMEOUT_MS,
          preferred
        );
        return normalizeResult(raw)?.tracks?.[0] || null;
      };

      if (item.kind === "track") {
        const match = await matchOne(items[0]);
        if (!match) throw new Error("Spotify found **" + items[0].name + "**, but no playable match was found on the configured audio sources.");
        return { loadType: "track", tracks: [match], searchSource: "spotify-match", spotify: items[0] };
      }

      // Limit playlist matching to ten catalogue entries per request to avoid
      // overwhelming Lavalink and hitting provider rate limits.
      const matches = (await Promise.allSettled(items.slice(0, 10).map(matchOne)))
        .filter(result => result.status === "fulfilled" && result.value)
        .map(result => result.value);
      if (!matches.length) throw new Error("The Spotify playlist was found, but none of its first tracks could be matched to playable audio.");
      return {
        loadType: "playlist",
        tracks: matches,
        searchSource: "spotify-match",
        playlistInfo: { name: item.playlist.name, selectedTrackCount: matches.length, totalTracks: item.playlist.total }
      };
    }

    const directUrl = Boolean(isUrl || URL_PATTERN.test(q));
    const failures = [];
    // MusicEngine.search already fans out across available nodes and uses
    // alternate providers for text queries. Keep this resolver to one bounded
    // call so we do not multiply provider retries and latency.
    try {
      const raw = directUrl
        ? await withTimeout(this.manager.resolve(q, { source: preferred, requester }), SEARCH_TIMEOUT_MS, preferred)
        : await withTimeout(this.manager.search(q, { source: preferred, requester }), SEARCH_TIMEOUT_MS, preferred);
      const result = normalizeResult(raw);
      if (result?.tracks?.length) return { ...result, tracks: result.tracks, searchSource: preferred };
      failures.push(preferred + ": no playable tracks");
    } catch (error) {
      failures.push(preferred + ": " + String(error?.message || "search failed").slice(0, 120));
    }

    if (directUrl) throw new Error("I couldn't load that URL from the configured Lavalink node. Try a supported audio URL or search by song title.");
    throw new Error("I couldn't find a playable result for **" + q.slice(0, 100) + "**. Tried " + preferred + ". Check that the Lavalink node and its source plugins are available.");
  }
}
