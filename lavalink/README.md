# Self-hosted Lavalink for AeroX / LightCore (Oracle Cloud Always Free)

This directory builds a Lavalink v4 node for the bot. Use an Oracle Cloud Always Free Linux VM if your account can provision one; availability depends on region/capacity and current Oracle limits. Do not create paid resources.

## 1. Create the VM

- Create an Always Free eligible Ubuntu or Oracle Linux VM.
- Use the smallest free eligible shape available in your tenancy; review the current cost estimate before creating anything.
- Add a private, strong password for Lavalink. Do not commit it to GitHub or post it in chat.
- In the VM firewall/security list, allow TCP 22 only from your own IP and TCP 2333 only from the bot host if you can restrict the source. If the bot is hosted elsewhere and cannot use a private network, use a TLS reverse proxy and expose WSS/HTTPS instead of publishing the raw node port.

## 2. Run Lavalink with Docker

Install Docker on the VM, clone this repository, then run:

```bash
cd AeroX-AIO-V3/lavalink
export LAVALINK_SERVER_PASSWORD='REPLACE_WITH_A_LONG_RANDOM_PASSWORD'
docker build -t aerox-lavalink .
docker run -d --name aerox-lavalink --restart unless-stopped \
  -p 127.0.0.1:2333:2333 \
  -e LAVALINK_SERVER_PASSWORD="$LAVALINK_SERVER_PASSWORD" \
  aerox-lavalink
docker logs --tail 100 aerox-lavalink
```

The loopback-only binding is intentional. For a remote bot, configure a TLS reverse proxy (for example, Caddy) to proxy secure WebSocket traffic to 127.0.0.1:2333, and open only the proxy's HTTPS port. Do not expose port 2333 publicly without an appropriate network restriction.

## 3. Configure the bot host

Set these environment variables on the bot service:

- `LAVALINK_HOST`: your node's public DNS hostname (without protocol)
- `LAVALINK_PORT`: `443` when using a TLS reverse proxy, otherwise the restricted node port
- `LAVALINK_PASSWORD`: exactly the same password as `LAVALINK_SERVER_PASSWORD`
- `LAVALINK_SECURE`: `true` for TLS/WSS, otherwise `false`

When `LAVALINK_HOST` is configured, AeroX selects that node rather than the legacy public node. If unset, the existing hardcoded fallback remains unchanged.

## 4. Verify before testing playback

1. Confirm `docker logs aerox-lavalink` reports that the server is ready.
2. From the bot logs, confirm a Lavalink node connects. Never print passwords or authorization headers.
3. Run the bot's search command, then `.play <song name>` in a test server and verify that the current track advances and audio is heard in voice.
4. Test pause/resume, skip, queue, URL resolution, autoplay, and reconnect after restarting the node.

A successful deploy or successful search is not proof of audio playback. The music system is only verified when a real Discord voice playback test succeeds.

## Notes

- Oracle's free capacity can be unavailable in some regions. Do not switch to a paid shape or enable billing just to make this work.
- A self-hosted node requires the VM to remain running. Monitor disk, memory, and Lavalink logs.
- Never commit credentials to this repository.
