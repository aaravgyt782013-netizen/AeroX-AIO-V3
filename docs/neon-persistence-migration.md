# Neon persistence migration plan

## Status

This branch is a staging branch only. The production entry point still uses the existing SQLite database layer. Do not merge or deploy this branch until the migration implementation and persistence tests are complete.

## Existing persistence surfaces

- Seven SQLite databases are initialized by `src/database/DatabaseManager.js`: guild, user, premium, moderation, ticket, invites, and automation.
- Database repositories call synchronous `Database.exec/get/all/prepare` methods and use SQLite-specific syntax.
- Guild repository performs schema discovery using `PRAGMA table_info`, and other repositories use SQLite-specific constructs including `AUTOINCREMENT`, `strftime`, and `INSERT OR/ON CONFLICT` patterns.
- Music settings are stored separately in `database/data/music-settings.json`.
- The app also has a `better-sqlite3` dependency.

## Migration constraints

A PostgreSQL client is asynchronous, but the current repository API is synchronous. Replacing `better-sqlite3` with `pg` inside the existing `Database` class would break callers and command flows. A safe migration must either:

1. refactor every repository and its callers to async PostgreSQL operations, or
2. retain SQLite and mount a persistent disk at the database directory (only if the hosting plan supports persistent disks).

Do not implement a partial driver swap.

## Required migration sequence

1. Confirm a working Neon `DATABASE_URL` exists in Render's secret environment; never log or commit its value.
2. Obtain a backup of all existing `.bread` files and `music-settings.json` from the running service if they still exist. Do not assume they can be recovered from Git.
3. Inventory all SQL statements, schemas, indexes, migrations, and callers of `prepare()` across the seven repositories.
4. Design PostgreSQL schemas and a data import process. Preserve IDs, timestamps, JSON-encoded values, booleans, counters, and unique constraints.
5. Refactor repositories to async calls and update all callers, including startup/shutdown and sharding paths.
6. Move music settings from JSON to PostgreSQL, with a one-time import path for existing settings.
7. Add integration tests for each repository, plus a restart/redeploy persistence test.
8. Open a pull request for review; deploy only after tests pass and a backup/rollback plan is ready.

## Acceptance criteria

- Existing bot commands continue to work without unhandled promise rejections.
- All seven repositories use the durable store in production.
- Music settings are durable and are not written to ephemeral local files.
- Repeated startup is idempotent and does not erase records.
- A test record written before restart is still present after restart.
- Secrets are never written to repository files or logs.
