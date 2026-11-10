# Chest Tracker 1.1.8

- Match recaps and streak-broken notices now appear in a HUD-styled popup docked under the MiniHUD instead of a centered window. Left-click the popup to dismiss it.
- Added a Last game stats button beside Settings that reopens the most recent game's recap.
- Clicking the MiniHUD no longer takes focus away from the game.
- Ending a game freezes it on the MiniHUD. The first chest anyone opens starts the next game for the whole party and counts in it; the host can also choose New game or press F8.
- A streak now needs two or more consecutive openings.

Compatibility: rooms that include anyone on 1.1.7 or older keep the previous behaviour (the next game starts as soon as a match ends), so mixed-version parties keep working while people update. Deploy the updated relay for frozen games and chest-start.

Validation: 32 automated tests pass, including a mixed-version relay room.
