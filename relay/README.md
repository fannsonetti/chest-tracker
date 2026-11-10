# Hosted squad relay

Deploy this service on an always-on server so players connect outbound instead of forwarding ports on their own computers. The app always uses the default hosted server at `ws://85.220.66.209:47800`. There are no server or LAN selectors.

## app-01 direct deployment

The relay is installed as the `chest-tracker-relay.service` user service on app-01. It is enabled, restarts on failure, and user lingering is enabled so it runs without an active SSH login. Its environment overrides bind it to `0.0.0.0:47800`. UFW permits TCP 47800, and the router forwards that port to app-01. Both the public health endpoint and a two-player room/match/streak test through `85.220.66.209:47800` passed on November 9, 2026.

```sh
systemctl --user status chest-tracker-relay.service
journalctl --user -u chest-tracker-relay.service -n 50
curl http://127.0.0.1:47800/health
```

The public lobby and full recap timeline update was deployed on November 9, 2026. Its server-side tests and a public two-player lobby/match/timeline check passed. The previous release is `~/.local/share/chest-tracker-relay/releases/hosted-lobbies-20261109`. The 1.1.8 relay (frozen finished matches, chest-start, and compatibility with older clients) was deployed on November 10, 2026 and passed a public two-player check; the active release is `~/.local/share/chest-tracker-relay/releases/relay-1.1.8`.

The direct IP endpoint uses plain WebSockets. No tunnel is installed. The following Docker/proxy instructions remain an alternative deployment with encrypted transport.

From the repository root on the server:

```sh
docker compose -f relay/compose.yaml up -d --build
curl http://127.0.0.1:47801/health
```

The relay binds its published port to loopback. Put an HTTPS reverse proxy in front of it. `Caddyfile.example` shows the minimal configuration; replace the example domain with a real domain pointing to the server. Caddy handles WebSocket upgrades. Only the reverse proxy needs to be externally reachable. If the server is behind NAT, use an existing public reverse proxy/tunnel or configure the server’s public ingress once; ordinary players do not need any router configuration.

If Docker is unavailable, use Node.js 22.12+ and run `npm ci --omit=dev --ignore-scripts` followed by `npm run relay`. The default bind is `127.0.0.1:47801`; override `HOST` and `PORT` as needed. Run it under your service manager for automatic restarts.

Create room in the Party tab, then have friends choose Join in the public lobby browser. Rooms are public and update as players join, leave, or close rooms. Deploy the current server code for lobby browsing and full recap timelines; older clients may still join using room codes.

The service sends immutable match-end snapshots to everyone before resetting the room. The host is assigned by the server, rather than by a client-supplied flag. Guests cannot end a match. Counts are self-reported, but leaderboard points are scored by the relay from its own receipt log and each match result is signed (see below), so points cannot be edited into saved history. Corrected openings rebuild the sequence used for streaks, and stale states from the prior match are ignored.

For local testing: `npm test` includes a real WebSocket integration test with two clients, permissions, synchronized recaps, streak breaks, resets, and room cleanup.

## Match signing key

The relay signs every match result with an Ed25519 private key. The app ships the matching public key in `proof.js` and only gives leaderboard points for results whose signature checks out. Without a key the relay signs with a throwaway one, and party points from it do not count.

The private key is `relay/signing-key.pem`. It is gitignored and must never be committed or shipped with the app. To deploy it:

- systemd service on app-01: copy the file to the server (for example `~/.config/chest-tracker-relay/signing-key.pem`, mode 600) and add `Environment=RELAY_SIGNING_KEY_FILE=/home/<user>/.config/chest-tracker-relay/signing-key.pem` to the service override, then restart it. Deploy `proof.js` next to `match.js`.
- Docker: put the file at `relay/signing-key.pem`; `compose.yaml` mounts it read-only.

To rotate the key, generate a new pair, put the private key on the server and the public key in `RELAY_PUBLIC_KEY` in `proof.js`, then release the app. Results signed with the old key stop counting.
