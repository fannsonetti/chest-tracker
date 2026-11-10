# Chest Tracker

A Windows Electron MiniHUD for tracking chest openings with your squad.

## Install

Download the Windows setup executable from [Releases](https://github.com/fannsonetti/chest-tracker/releases/latest) and run it. It installs in one click, with no setup wizard. Updates are fully automatic: installed copies check GitHub Releases at launch and every 30 minutes, download in the background, then install silently and relaunch once you are idle (not in a party and no count change for three minutes). If you never go idle, the update installs silently when you quit. Copies on 1.1.8 or older show the old wizard one last time for the update to 1.1.9. Portable copies do not automatically update; install the new setup once to switch.

The current build is unsigned. Windows may show its usual unknown-publisher prompt.

## Use

- Open the settings icon for the options window. Its sidebar holds Overlay, Party, Matches, Session, Leaderboards and Your stats, styled to match the MiniHUD. The window loads in the background after launch, so it opens instantly.
- Leaderboards rank players by most chests in one match, best streak, average or matches played, for Solo, Duo, Trio, and Squads, with a podium for the top three. They use up to 300 locally saved matches. Solo lobbies have no streaks, and custom lobbies above four players are excluded.
- Your stats shows your career: total and best chests, average, chests per minute, best streak, matches you led, team share, your last 20 matches and a breakdown by lobby size.
- Choose personal, team, personal/team, or merged counts. Team and merged counts include your own chests once.
- Set your name in Party and choose **Create room**, or **Join** a room in the public lobby browser. All rooms use the default hosted server; no server settings, LAN mode, room code, or address entry is needed.
- Only the party host can end a match. F8 ends a solo match or the host’s party match; guests cannot end it. Everyone receives the same frozen roster and streak recap. The finished game stays on the MiniHUD (clock stopped) until the next one starts: the first chest anyone opens starts it and counts in it, or the host can choose **New game** at the bottom of the MiniHUD (or press F8 again). In a party the next game starts for everyone. If anyone in the room runs a version older than 1.1.8, the next game starts as soon as a match ends, as it did before.
- A streak is only broken when another one starts. Anyone who opens two chests before the holder opens another takes the streak over at 2. Until then, their count is hidden and the holder keeps the streak. When the holder opens a chest, the streak grows and every hidden count resets to 0. A takeover keeps the other players’ hidden counts. With no holder yet, the first player to open two chests starts one. A single opening is not a streak. The host receipt order resolves simultaneous openings. Openings before connection establish a baseline and are excluded from streaks. Corrections undo that player’s most recent recorded openings. Each match starts a fresh streak record.
- Match recaps appear in a HUD-styled card in the middle of the screen. It settles in from a soft blur, steps through total, chest share, streaks and timeline for about five seconds each, then fades away; hover pauses it. When someone takes over an active streak, a small pill drops in at the top middle of the screen showing only who broke it, with the flame struck through and cooling to grey. If it was your streak, a soft falling tone plays (off when the click sound is off). Popups never take focus from the game. Matches history keeps the full recap. Timelines record openings after connection; corrections undo the latest openings. Reduced-motion settings suppress the animation.
- Chest subtraction stops at the current match’s counts. Completed matches stay unchanged. Click feedback plays for mouse and hotkey count changes; Overlay options include a sound toggle and test button.
- Default keys: numpad `+` / `-` for your chests, F8 to end a match, F9 to hide stats. Bindings are configurable. Holding a key counts once; each chest needs its own press. Team chests come only from teammates' own counts.
- Points leaderboard: every chest is worth 10 points, plus 10% per level of your live streak, times the lobby size (solo 1x, duos 2x, trios 3x, squads 4x). The relay scores party matches from its own log and signs each result; the app only counts party points whose signature checks out, so edited history earns nothing.
- CPM (chests per match) and averages skip matches where you opened fewer than 5 chests.

Streaks require at least two players in the lobby. Openings while alone do not build a streak or carry into a streak when someone joins. Left-click a popup to dismiss it. The trophy button beside Settings reopens the last game’s recap; earlier recaps remain available under Matches → View full recap. Clicking the MiniHUD never takes focus from the game.

Counts and history are stored locally, not in a cloud account. Session rates reset when the app opens or you select New session.

## Develop

Use Node.js 22.12 or newer.

```powershell
npm ci
npm test
npm start
npm run dist -- --publish never
```

`npm run dist:portable -- --publish never` also builds a portable executable. Build outputs are in `dist/`.

## Releases and automatic updates

The GitHub Actions workflow builds the installer, blockmap, and `latest.yml` when a `v*` tag is pushed, or when manually dispatched. Bump `package.json` and lockfile version together, commit, and push a matching version tag. Public GitHub Releases provide the update feed; never embed a GitHub token in the app. Automatic updates follow published versions, not every source commit.

## Hosted rooms

Squad traffic and the public lobby browser always use the default server at ws://85.220.66.209:47800. Create room publishes your room to everyone using that server. Choose Join in the browser to connect. The browser updates when players join, leave, or close rooms. Each room supports 16 players and closes when its host leaves. Direct LAN and custom server selection are not available.

The server in relay/server.js must include public lobby discovery and recap timelines. Streaks are computed on the server, so the streak rules above apply only after the relay is redeployed with this version's `match.js`. See [relay/README.md](relay/README.md) for deployment.

## Design concepts

[Selected Ledger SVG reference](docs/designs/minihud-concepts.svg): 224 × 214. The HUD shows squad game counts, one fire streak indicator beside the current holder, a crown to the left of the game leader’s name, personal/team chests this game, chests per match, and one shared token chance. Before a streak starts, one grey idle flame appears beside you. Lifetime/session/hourly details and explanatory footers are omitted from the HUD. This layout is implemented in version 1.1.3; earlier A/B references are retained as historical proposals.
