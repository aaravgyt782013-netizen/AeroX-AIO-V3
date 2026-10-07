# LightCore Lavalink

LightCore uses an isolated Lavalink v4.2.2 node with the official Lavalink YouTube source plugin.

## Render

Create a separate Docker web/private service using this directory as its root. Expose port 2333 and set:

- LAVALINK_SERVER_PASSWORD = a strong private password

The LightCore bot then uses:

- LAVALINK_HOST = the Lavalink service hostname
- LAVALINK_PORT = 2333
- LAVALINK_PASSWORD = the same password
- LAVALINK_SECURE = true when the service is exposed through HTTPS/WSS

Do not put the password in GitHub.
