# LightCore AIO V3 - Ultimate Discord Bot

LightCore is a feature-rich Discord bot built with **discord.js v14**, featuring advanced hybrid sharding for scalability, high-quality music streaming via Lavalink, and a modular architecture.

[![Support Server](https://img.shields.io/discord/1070267471958614057?color=7289da&label=Support%20Server&logo=discord)](https://discord.gg/lightcore)

## 🚀 Features

- **Music**: Queue and control audio through configured Lavalink sources, plus Spotify catalog search and official track/playlist links. Spotify catalog results are not streamed into Discord.
- **Advanced Sharding**: Powered by `discord-hybrid-sharding` for maximum stability and performance.
- **Persistent Storage**: Uses **Better-SQLite3** for lightning-fast data management.
- **Extensive Command List**: Over 190+ prefix commands and 120+ slash commands.
- **Music Filters**: Enhance your audio with Bassboost, Nightcore, Vaporwave, and more.
- **Module Categories**:
    - 🎵 **Music**: Full playback control, playlists, and 24/7 mode.
    - 🛡️ **Moderation**: Advanced tools like ban, kick, mute, and warn.
    - 🎫 **Tickets**: Comprehensive ticket system for support.
    - 🎉 **Giveaways**: Professional giveaway management.
    - 🎮 **Fun & Utility**: Rank cards, memes, image processing, and more.

## 📁 Project Structure

```text
├── src/
│   ├── commands/       # Categorized bot commands
│   ├── config/         # Configuration files & emoji maps
│   ├── database/       # SQLite managers and repository pattern
│   ├── events/         # Discord, Node, and Lavalink event handlers
│   ├── structures/     # Core classes (Client, Command, etc.)
│   ├── utils/          # Helper functions and registration logic
│   ├── index.js        # Main bot entry point
│   └── shard.js        # Cluster/Sharding manager
├── database/data/      # Persistent .bread database files
├── docsweb/            # Static documentation files
└── LICENSE             # Custom non-commercial license
```

## 🛠️ Requirements

- **Node.js**: v18 or higher
- **Lavalink**: An active Lavalink node for music features
- **Database**: SQLite3 (automatically initialized)

## 📜 License

This project is licensed under a custom agreement. It is free for **personal, non-commercial use**. Redistribution for profit or creating video tutorials/showcases of the source code without permission is strictly prohibited. See [LICENSE](./LICENSE) for full details.

## 🙌 Credits

- **Developers**: Shinchan & **LightCore Development**
- **Base Code**: This project uses [Yukihana](https://github.com/bre4d777/Yukihana) by **bre4d777** as its foundation.

---

### 📞 Support

Join our support server for help and updates: [discord.gg/lightcore](https://discord.gg/lightcore)


## 🎧 Music V2 / Spotify catalog

- Music commands are **prefix-only**; music slash commands are not registered.
- `.play <song title or URL>` searches supported Lavalink playback sources.
- `.control` opens the interactive now-playing control panel.
- `.settings` opens the music settings panel. Server managers can configure the DJ role, autoplay, 24/7, announcements, vote-skip, default source, a dedicated music voice channel, and the channel where now-playing panels are posted.
- When a music voice channel is configured, members must join that channel before using playback commands. If no panel channel is explicitly set, LightCore uses the configured voice channel's chat when Discord exposes it as text-based; otherwise it falls back to the command channel.
- Each track start posts a fresh control panel in the configured panel channel. If that channel cannot be reached or messages cannot be sent, LightCore falls back to the command channel.
- Autoplay keeps the player alive while enabled, attempts to pick a next track when the queue ends, and saves its voice session for restoration after restart when the saved channel and Lavalink node are available.
- Player, queue, and autoplay state are keyed by guild so multiple servers can play independently, subject to Lavalink and hosting capacity.
- `.spotify <song title>` searches Spotify's catalog and returns official Spotify links.
- `.spotify <Spotify track URL>` shows track metadata.
- `.spotify <Spotify playlist URL>` shows playlist metadata and up to 10 track entries.
- Spotify API credentials are optional until you use `.spotify`: set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in your deployment environment. Never commit real credentials.
- Spotify catalog access is metadata/link lookup only. Spotify does not provide unrestricted Discord voice-streaming access; the bot does not convert Spotify links into audio from another service.

After changing commands, redeploy the bot and verify playback in a test server. A successful search alone does not prove voice audio works.
