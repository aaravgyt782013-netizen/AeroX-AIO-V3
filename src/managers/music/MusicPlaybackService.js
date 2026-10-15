/**
 * Music playback service.
 *
 * All query resolution and queue insertion goes through this module so prefix
 * commands and future interactions share the same source fallback and capacity
 * rules. Lavalink credentials and connection lifecycle remain in MusicManager.
 */
const SEARCH_SOURCES = ["ytmsearch", "ytsearch", "scsearch"];
const SPOTIFY_URL = /^https?:\/\/(?:open\.)?spotify\.com\/(?:track|album|playlist)\//i;
const HTTP_URL = /^https?:\/\//i;

export function isHttpUrl(value) {
  return HTTP_URL.test(String(value || "").trim());
}

export function isSpotifyUrl(value) {
  return SPOTIFY_URL.test(String(value || "").trim());
}

export function availableQueueSlots(player, maxQueue) {
  const limit = Math.max(1, Number(maxQueue) || 100);
  const upcoming = Array.isArray(player?.queue?.tracks) ? player.queue.tracks.length : 0;
  return Math.max(0, limit - upcoming);
}

function hasTracks(result) {
  return Array.isArray(result?.tracks) && result.tracks.length > 0;
}

async function resolveSpotifyMetadata(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchImpl("https://open.spotify.com/oembed?url=" + encodeURIComponent(url), {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const title = String(payload?.title || "").trim();
    return title ? { title, author: String(payload?.author_name || "").trim() } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a track or playlist. Direct URLs are tried as URLs first. Search terms
 * use the configured provider followed by common Lavalink v4 providers.
 * Spotify is metadata-only: the playable audio is searched on the configured
 * Lavalink sources rather than attempting to stream Spotify directly.
 */
export async function searchWithFallback(player, query, settings = {}, requester, options = {}) {
  const input = String(query || "").trim();
  if (!input) return { tracks: [], loadType: "empty" };

  const isUrl = isHttpUrl(input);
  const spotify = isSpotifyUrl(input);
  let lastError = null;

  if (isUrl && !spotify) {
    try {
      const direct = await player.search({ query: input }, requester);
      if (hasTracks(direct)) return direct;
    } catch (error) {
      lastError = error;
    }
  }

  let searchTerm = input;
  if (spotify) {
    const metadata = await resolveSpotifyMetadata(input, options.fetchImpl);
    if (!metadata?.title) {
      if (lastError) throw lastError;
      return { tracks: [], loadType: "empty", spotifyResolutionFailed: true };
    }
    searchTerm = [metadata.author, metadata.title].filter(Boolean).join(" ");
  }

  const configured = String(settings.defaultSource || "ytmsearch").toLowerCase();
  const sources = [...new Set([configured, ...SEARCH_SOURCES])].filter(source => SEARCH_SOURCES.includes(source));
  for (const source of sources) {
    try {
      const result = await player.search({ query: searchTerm, source }, requester);
      if (hasTracks(result)) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return { tracks: [], loadType: "empty" };
}

/**
 * Add only tracks that fit the configured upcoming queue limit. Starting
 * playback is intentionally done once after the accepted batch is queued.
 */
export async function addTracks(player, tracks, maxQueue) {
  const candidates = Array.isArray(tracks) ? tracks : [];
  const slots = availableQueueSlots(player, maxQueue);
  const accepted = candidates.slice(0, slots);
  for (const track of accepted) await player.queue.add(track);

  if (accepted.length && !player.playing && !player.paused) {
    await player.play();
  }

  return {
    accepted: accepted.length,
    rejected: candidates.length - accepted.length,
    queueLimit: Math.max(1, Number(maxQueue) || 100)
  };
}

export async function ensurePlayer(manager, { guildId, voiceChannelId, textChannelId, volume }) {
  if (!manager?.lavalink) throw new Error("The Lavalink music engine is not configured.");
  let player = manager.getPlayer(guildId);
  if (player?.voiceChannelId && player.voiceChannelId !== voiceChannelId) {
    throw new Error("LightCore is already connected to another voice channel in this server.");
  }
  if (!player) {
    player = manager.lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId,
      selfDeaf: true,
      volume
    });
  }
  if (!player.connected) await player.connect();
  return player;
}
