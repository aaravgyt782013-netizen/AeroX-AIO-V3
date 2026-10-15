# LightCore Dashboard

A separate dashboard app in the repository's `dashboard/` folder. It uses Discord OAuth2 login, only lists servers where the signed-in user has Manage Server/Administrator permissions and where LightCore is present, and stores per-server dashboard settings in Neon PostgreSQL.

## Run locally

1. Create a Discord application at https://discord.com/developers/applications and add the OAuth2 redirect URI `http://localhost:3000/auth/callback`.
2. Copy `.env.example` to `.env` and set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SESSION_SECRET`, and `DATABASE_URL`.
3. In `dashboard/`, run `npm install` then `npm start`.
4. Open `http://localhost:3000`.

## Deploy

Deploy `dashboard/` as a separate Node web service with root directory `dashboard`, build command `npm install`, start command `npm start`, and the same environment variables. Use HTTPS for the production OAuth redirect URI. Set `SESSION_SECRET` to a long random value. Never commit `.env` or bot tokens.

## Current scope

OAuth login, eligible server selection, overview, configuration forms for welcome, leveling, logging, tickets and moderation, and Neon-backed settings storage are implemented. Settings are saved by this dashboard API; the bot runtime must read/apply these settings for each feature before changes affect Discord. This dashboard does not claim to execute moderation actions or configure live bot modules unless those modules are integrated with the settings table.