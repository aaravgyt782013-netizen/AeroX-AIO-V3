/**
 * Music search orchestration for LightCore.
 * Uses the configured Lavalink manager and tries compatible search providers
 * instead of failing on the first empty result.
 */
const SEARCH_ORDER = ["ytmsearch", "ytsearch", "scsearch"];

const isHttpUrl = value => /^https?:\/\//i.test(value);

export class MusicSearchEngine {
  constructor(manager) {
    this.manager = manager;
  }

  async search(query, { source = "ytmsearch", requester, isUrl = false } = {}) {
    const q = String(query || "").trim();
    if (!q) throw new Error("Give me a song name or URL.");
    const sources = isUrl ? [source] : [...new Set([source, ...SEARCH_ORDER])];
    const failures = [];

    for (const provider of sources) {
      try {
        const result = isUrl || isHttpUrl(q)
          ? await this.manager.resolve(q, { source: provider, requester })
          : await this.manager.search(q, { source: provider, requester });

        if (Array.isArray(result?.tracks) && result.tracks.length) {
          return { ...result, tracks: result.tracks.filter(track => track?.info?.identifier || track?.encoded) };
        }
        failures.push(provider + ": no tracks");
      } catch (error) {
        failures.push(provider + ": " + (error?.message || "search failed"));
      }
    }

    const safeDetails = failures.length ? " Tried: " + failures.map(x => x.split(":")[0]).join(", ") + "." : "";
    throw new Error("No playable results were found." + safeDetails);
  }
}
