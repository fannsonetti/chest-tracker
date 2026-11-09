# Chest Tracker

A Windows Electron MiniHUD for tracking chest openings with your squad.

## Install

Download `ChestTracker-Setup-1.1.4.exe` from [Releases](https://github.com/fannsonetti/chest-tracker/releases/latest) and run the installer. Installed copies check GitHub Releases on every launch, download newer versions, and restart to install while idle. If you have started tracking or joined a party during the download, installation waits until you quit. Portable copies do not automatically update; install the new setup once to switch.

The current build is unsigned. Windows may show its usual unknown-publisher prompt.

## Use

- Open the settings icon for the separate options window, with Overlay, Party, Matches, and Session tabs.
- Choose personal, team, personal/team, or merged counts. Team and merged counts include your own chests once.
- Set your name and create or join a hosted room using a room code. The default relay is `ws://85.220.66.209:47800` on app-01. Direct LAN hosting is also available.
- On app-01’s network, the Party tab’s **Same network** shortcut uses `ws://192.168.0.57:47800`. **Internet** selects the public address for friends outside that network.
- Only the party host can end a match. F8 ends a solo match or the host’s party match; guests cannot end it. Everyone receives the same frozen roster and streak recap, then starts the next match.
- A streak is consecutive chest openings by one person, broken by another player’s opening. The host/relay receipt order resolves simultaneous openings. Openings before connection establish a baseline and are excluded from streaks. Corrections undo that player’s most recent recorded openings. Each match starts a fresh streak record.
- Recaps include each connected player’s personal openings and the longest streak. History stores the recap. Reduced-motion settings suppress the animation.
- Default keys: numpad `+` / `-` for personal chests, Ctrl+numpad `+` / `-` for team corrections, F8 to end a match, F9 to hide stats. Bindings are configurable.

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

## Relay hosting

See [relay/README.md](relay/README.md). The relay supports up to 16 players per room and host-only match ending. app-01 runs it as an enabled user service on TCP 47800, with its firewall rule and router forwarding configured. The public health endpoint and a two-player match through `85.220.66.209:47800` have been verified. The specified IP endpoint uses plain WebSockets. Room codes are bearer access: share them with your squad. Rooms close when the host disconnects; they are held in memory and do not survive a server restart.

## Design concepts

[Selected Ledger SVG reference](docs/designs/minihud-concepts.svg): 224 × 214. The HUD shows squad game counts, one fire streak indicator beside the current holder, a crown to the left of the game leader’s name, personal/team chests this game, chests per match, and one shared token chance. Before a streak starts, one grey idle flame appears beside you. Lifetime/session/hourly details and explanatory footers are omitted from the HUD. This layout is implemented in version 1.1.3; earlier A/B references are retained as historical proposals.
