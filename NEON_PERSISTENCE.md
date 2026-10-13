# Neon persistence layer

This branch adds a durable Neon-backed persistence layer while preserving the bot's existing synchronous SQLite repository API.

## What is persisted

- The seven runtime SQLite databases (guild, user, premium, moderation, ticket, invites, and automation) are stored as binary snapshots in the Neon table `aerox_sqlite_snapshots`.
- Music configuration is stored as JSONB in `aerox_json_snapshots` and mirrored to the local `database/data/music-settings.json` file.
- The parent shard process restores SQLite snapshots from Neon before spawning clusters. Writes through the shared database wrapper schedule a fresh snapshot; graceful shutdown flushes pending snapshots.

## Required environment

Set `DATABASE_URL` on Render to the Neon connection string. `NEON_POOL_MAX` is optional and defaults to `5`. Do not commit real connection strings to the repository.

## Important scope limitation

This is a persistence compatibility layer, not a completed conversion of every repository query to native PostgreSQL. Runtime repository reads and writes still execute against SQLite working copies; Neon stores the durable database snapshots and music settings. A fully native PostgreSQL migration would require converting the repository SQL and its synchronous call sites to asynchronous PostgreSQL operations.

On the first startup, if Neon has no snapshots yet, the bot seeds snapshots as the local SQLite databases initialize. Data that was already lost before this layer is deployed cannot be recovered automatically. Verify the Render logs for successful Neon connection, restore, and snapshot messages before treating the deployment as validated.
