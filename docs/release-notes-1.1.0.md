Chest Tracker 1.1.0 adds a separate options window, selectable personal/team/merged counts, host-only party match endings, and animated match recaps with per-player openings and consecutive-opening streaks.

Download and run **ChestTracker-Setup-1.1.0.exe**. This installs the app and enables automatic update checks on every launch. New versions download automatically and install while idle, or when you quit if tracking has started. Existing portable copies need this one-time installer switch.

Hosted rooms support room codes and outbound WebSocket connections so players do not need to forward ports. The relay implementation and deployment files are included in the repository. **The production relay is not deployed yet**; until its secure URL is configured, use direct LAN hosting.

A streak is consecutive chest openings by one player, broken by another player opening a chest. The host/relay receipt order determines the sequence. Recaps reset the streak record for each new match.

Validated with 13 automated tests and a real Electron options/overlay/recap smoke check. Includes updated Electron 45 and the Windows installer/update manifest. The installer is unsigned.

The A Glass, B Tactical, and C Relic concept designs are in `docs/minihud-concepts-v2.png`; the final MiniHUD styling is awaiting selection.
