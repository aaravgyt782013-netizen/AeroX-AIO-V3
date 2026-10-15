import test from "node:test";
import assert from "node:assert/strict";
import {
  addTracks,
  availableQueueSlots,
  searchWithFallback
} from "./MusicPlaybackService.js";

test("queue capacity counts upcoming tracks and never returns a negative number", () => {
  assert.equal(availableQueueSlots({ queue: { tracks: [{}, {}] } }, 5), 3);
  assert.equal(availableQueueSlots({ queue: { tracks: [{}, {}, {}] } }, 2), 0);
  assert.equal(availableQueueSlots({ queue: { tracks: [] } }, 0), 100);
});

test("queue insertion respects the limit and starts playback once", async () => {
  const added = [];
  let plays = 0;
  const player = {
    queue: {
      tracks: [{ id: "already-queued" }],
      add: async track => added.push(track)
    },
    playing: false,
    paused: false,
    play: async () => { plays += 1; }
  };
  const result = await addTracks(player, [{ id: "a" }, { id: "b" }, { id: "c" }], 3);
  assert.deepEqual(added, [{ id: "a" }, { id: "b" }]);
  assert.equal(result.accepted, 2);
  assert.equal(result.rejected, 1);
  assert.equal(plays, 1);
});

test("search fallback tries configured provider before other supported providers", async () => {
  const calls = [];
  const player = {
    search: async ({ query, source }) => {
      calls.push({ query, source });
      return source === "scsearch" ? { tracks: [{ info: { title: "Found" } }], loadType: "search" } : { tracks: [], loadType: "empty" };
    }
  };
  const result = await searchWithFallback(player, "sample song", { defaultSource: "ytsearch" }, "requester");
  assert.equal(result.tracks[0].info.title, "Found");
  assert.deepEqual(calls.map(call => call.source), ["ytsearch", "ytmsearch", "scsearch"]);
});

test("Spotify URL is converted to metadata search instead of streamed directly", async () => {
  const calls = [];
  const player = {
    search: async ({ query, source }) => {
      calls.push({ query, source });
      return { tracks: [{ info: { title: "Track" } }], loadType: "search" };
    }
  };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ title: "Track Name", author_name: "Artist Name" })
  });
  const result = await searchWithFallback(
    player,
    "https://open.spotify.com/track/example",
    { defaultSource: "ytmsearch" },
    "requester",
    { fetchImpl }
  );
  assert.equal(result.tracks.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, "Artist Name Track Name");
  assert.equal(calls[0].source, "ytmsearch");
});
