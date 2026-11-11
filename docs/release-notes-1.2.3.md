# Chest Tracker 1.2.3

- Streaks are harder to hold. You get 60 seconds between chests, and the window shrinks as your flame climbs: 45 seconds at blue (10+), 30 at purple (25+) and 20 at white (50+). The leader no longer gets a separate shorter window.
- Your streak timer now fills the whole MiniHUD top bar in your flame colour and drains as your time runs out. Other players' timers are no longer shown.
- Losing your streak, whether it is taken or runs out, plays a falling tone.
- The streak-taken pill is bigger and sits a little lower on screen.
- Clicking a match recap goes to its next page; the last page closes it. The X always closes it.
- Chest hotkeys respond faster: holding a key still counts once, but separate presses only need to be 80ms apart.
- The MiniHUD reopens where you last dragged it.
- New gold chest logo for the app.
- On upgrade, matches saved before recaps existed are removed, so CPM, Your stats and the leaderboards all count the same games.

Deployment: the new streak windows apply to party games once the relay runs this version's `match.js`. Solo games use them right away.

Validation: 52 automated tests pass.
