# Hosted squad relay

Deploy this service on an always-on server so players connect outbound instead of forwarding ports on their own computers. The app accepts `wss://` URLs (plus `ws://localhost` for development).

From the repository root on the server:

```sh
docker compose -f relay/compose.yaml up -d --build
curl http://127.0.0.1:47801/health
```

The relay binds its published port to loopback. Put an HTTPS reverse proxy in front of it. `Caddyfile.example` shows the minimal configuration; replace the example domain with a real domain pointing to the server. Caddy handles WebSocket upgrades. Only the reverse proxy needs to be externally reachable. If the server is behind NAT, use an existing public reverse proxy/tunnel or configure the server’s public ingress once; ordinary players do not need any router configuration.

If Docker is unavailable, use Node.js 22.12+ and run `npm ci --omit=dev --ignore-scripts` followed by `npm run relay`. The default bind is `127.0.0.1:47801`; override `HOST` and `PORT` as needed. Run it under your service manager for automatic restarts.

Configure the resulting `wss://` URL in the app’s Party tab. Create room, share the ten-character code, then have friends join using the same relay URL and code.

The service sends immutable match-end snapshots to everyone before resetting the room. The host is assigned by the server, rather than by a client-supplied flag. Guests cannot end a match. Counts are self-reported; this is a squad tracker rather than an anti-cheat system. Corrected openings rebuild the sequence used for streaks, and stale states from the prior match are ignored.

For local testing: `npm test` includes a real WebSocket integration test with two clients, permissions, synchronized recaps, streak breaks, resets, and room cleanup.
