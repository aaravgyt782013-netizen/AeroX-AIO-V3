import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neonPool, neonQuery } from "./connection.js";
import { logger } from "#utils/logger";

const here = path.dirname(fileURLToPath(import.meta.url));
const states = new Map();
let schemaPromise;

function ensureTable() {
  if (!schemaPromise) {
    schemaPromise = neonQuery("CREATE TABLE IF NOT EXISTS aerox_sqlite_snapshots (database_key TEXT PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())")
      .catch((error) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

function fileFor(key) {
  return path.resolve(here, "..", "data", key);
}

export async function restoreNeonSnapshots() {
  await ensureTable();
  const { rows } = await neonQuery("SELECT database_key, data, updated_at FROM aerox_sqlite_snapshots");
  for (const row of rows) {
    const destination = fileFor(row.database_key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rm(destination + "-wal", { force: true });
    await fs.rm(destination + "-shm", { force: true });
    await fs.writeFile(destination, row.data);
    logger.info("[Neon]", `Restored ${row.database_key} snapshot from ${new Date(row.updated_at).toISOString()}`);
  }
  logger.success("[Neon]", rows.length ? `Restored ${rows.length} database snapshot(s)` : "No previous snapshots found; local databases will seed Neon during initialization");
  return rows.length;
}

export function registerNeonSnapshot(key, database, filePath) {
  states.set(key, { key, database, filePath, dirty: false, running: null, failed: false });
}

export function scheduleNeonSnapshot(key) {
  const state = states.get(key);
  if (!state) return;
  state.dirty = true;
  if (!state.running) {
    state.failed = false;
    state.running = drain(state)
      .catch((error) => {
        state.dirty = true;
        state.failed = true;
        logger.error("[Neon]", `Snapshot persistence failed for ${key}`, error);
      })
      .finally(() => {
        state.running = null;
        if (state.dirty && !state.failed) scheduleNeonSnapshot(key);
      });
  }
}
async function saveOne(state) {
  await ensureTable();
  const client = await neonPool.connect();
  const lock = `aerox-snapshot-${state.key}`;
  const temp = `${state.filePath}.${process.pid}.snapshot.tmp`;
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lock]);
    locked = true;
    await state.database.backup(temp);
    const bytes = await fs.readFile(temp);
    await client.query(
      "INSERT INTO aerox_sqlite_snapshots (database_key, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (database_key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at",
      [state.key, bytes]
    );
    logger.debug("[Neon]", `Persisted ${state.key} (${bytes.length} bytes)`);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lock]).catch(() => {});
    client.release();
  }
}

async function drain(state) {
  while (state.dirty) {
    state.dirty = false;
    await saveOne(state);
  }
}

export async function flushNeonSnapshots() {
  for (const state of states.values()) {
    if (state.running) await state.running;
    if (state.dirty) {
      // Retry a failed write once during graceful shutdown.
      state.failed = false;
      state.running = drain(state)
        .catch((error) => {
          state.dirty = true;
          state.failed = true;
          logger.error("[Neon]", `Final snapshot flush failed for ${state.key}`, error);
        })
        .finally(() => { state.running = null; });
      await state.running;
    }
  }
  const failed = [...states.values()].filter((state) => state.failed);
  if (failed.length) {
    throw new Error(`Unable to persist Neon snapshot(s): ${failed.map((state) => state.key).join(", ")}`);
  }
  if ([...states.values()].some((state) => state.dirty || state.running)) {
    await flushNeonSnapshots();
  }
}
