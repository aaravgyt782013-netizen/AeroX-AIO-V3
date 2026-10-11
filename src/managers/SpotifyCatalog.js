const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

function spotifyId(input) {
  const value = String(input || "").trim();
  const uri = value.match(/^spotify:(track|playlist):([A-Za-z0-9]+)$/i);
  if (uri) return { type: uri[1].toLowerCase(), id: uri[2] };
  try {
    const url = new URL(value);
    if (!/(^|\\.)spotify\\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\\/(track|playlist)\\/([A-Za-z0-9]+)/i);
    return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
  } catch {
    return null;
  }
}

const artistsText = artists => (artists || []).map(artist => artist?.name).filter(Boolean).join(", ") || "Unknown artist";
const duration = ms => {
  const seconds = Math.floor(Number(ms || 0) / 1000);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
};

export class SpotifyCatalog {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.SPOTIFY_CLIENT_ID || "";
    this.clientSecret = config.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || "";
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  _requireCredentials() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Spotify catalog is not configured yet. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the bot's environment variables.");
    }
  }

  async _getToken() {
    this._requireCredentials();
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) return this.token;
    const auth = Buffer.from(this.clientId + ":" + this.clientSecret).toString("base64");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("Spotify is rate-limiting requests. Please retry in a little while.");
      throw new Error("Spotify authentication failed. Check the Spotify app credentials in your environment variables.");
    }
    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000;
    return this.token;
  }

  async _get(path) {
    const token = await this._getToken();
    const response = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
    if (!response.ok) {
      if (response.status === 429) throw new Error("Spotify is rate-limiting requests. Please retry in a little while.");
      if (response.status === 401) {
        this.token = null;
        this.tokenExpiresAt = 0;
        throw new Error("Spotify authorization expired. Please try again.");
      }
      if (response.status === 404) throw new Error("That Spotify track or playlist could not be found or is not accessible.");
      throw new Error("Spotify returned an error (" + response.status + "). Please try again later.");
    }
    return response.json();
  }

  async searchTracks(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) throw new Error("Enter a song title or paste a Spotify track/playlist link.");
    const data = await this._get("/search?type=track&limit=" + Math.min(10, Math.max(1, limit)) + "&q=" + encodeURIComponent(q));
    return (data.tracks?.items || []).map(track => ({
      id: track.id,
      name: track.name,
      artists: artistsText(track.artists),
      album: track.album?.name || "Unknown album",
      duration: duration(track.duration_ms),
      url: track.external_urls?.spotify || "https://open.spotify.com/track/" + track.id
    }));
  }

  async getTrack(id) {
    const track = await this._get("/tracks/" + encodeURIComponent(id));
    return {
      id: track.id,
      name: track.name,
      artists: artistsText(track.artists),
      album: track.album?.name || "Unknown album",
      duration: duration(track.duration_ms),
      url: track.external_urls?.spotify || "https://open.spotify.com/track/" + track.id
    };
  }

  async getPlaylist(id) {
    const data = await this._get("/playlists/" + encodeURIComponent(id) + "?fields=name,external_urls,owner(display_name),tracks(total,items(track(name,artists(name),duration_ms,external_urls)))");
    const tracks = (data.tracks?.items || []).map(item => item.track).filter(Boolean).slice(0, 10).map(track => ({
      name: track.name || "Unknown track",
      artists: artistsText(track.artists),
      duration: duration(track.duration_ms),
      url: track.external_urls?.spotify || ""
    }));
    return {
      name: data.name || "Spotify playlist",
      owner: data.owner?.display_name || "Unknown",
      total: Number(data.tracks?.total || tracks.length),
      url: data.external_urls?.spotify || "https://open.spotify.com/playlist/" + id,
      tracks
    };
  }

  async inspect(input) {
    const link = spotifyId(input);
    if (!link) return { kind: "search", tracks: await this.searchTracks(input) };
    if (link.type === "track") return { kind: "track", track: await this.getTrack(link.id) };
    return { kind: "playlist", playlist: await this.getPlaylist(link.id) };
  }
}
