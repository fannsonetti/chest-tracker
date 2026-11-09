# Hosted squad relay

Deploy this service on an always-on server so players connect outbound instead of forwarding ports on their own computers. The app accepts `wss://` URLs, `ws://localhost` for development, and the explicitly configured app-01 addresses `ws://85.220.66.209:47800` (Internet) and `ws://192.168.0.57:47800` (Same network).

## app-01 direct deployment

The relay is installed as the `chest-tracker-relay.service` user service on app-01. It is enabled, restarts on failure, and user lingering is enabled so it runs without an active SSH login. Its environment overrides bind it to `0.0.0.0:47800`. UFW permits TCP 47800. The public router must forward TCP 47800 to app-01 on the same port; a healthy LAN endpoint does not establish public reachability.

```sh
systemctl --user status chest-tracker-relay.service
journalctl --user -u chest-tracker-relay.service -n 50
curl http://127.0.0.1:47800/health
```

The direct IP endpoint uses plain WebSockets. No tunnel is installed. The following Docker/proxy instructions remain an alternative deployment with encrypted transport.

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
