# Chest Tracker 1.1.9

- Updates are fully automatic. The installer is one-click with no setup wizard, and updates install silently and relaunch the app. It checks at launch and every 30 minutes, then installs once you are idle (not in a party, no count change for three minutes) or when you quit. Updating from 1.1.8 or older shows the old wizard one last time.
- Faster startup. The MiniHUD loads in roughly half the time, shows only once it has drawn, and the options window loads in the background so it opens instantly. Opening the app twice no longer starts a second copy.
- New streak rules: a streak is only broken when another one starts. Anyone who opens two chests before the holder opens another takes it over. Until then their count is hidden. When the holder opens a chest, every hidden count resets to 0. A takeover keeps the other players' hidden counts.
- The streak popup is a small pill at the top middle of the screen. It shows only who broke the streak, with the flame struck through and cooling to grey. A soft tone plays when you lose your own streak (off when the click sound is off).
- Match recaps appear in the middle of the screen. Both popups animate in and out.
- Redesigned options window with a sidebar, switches and an update status card.
- Leaderboards rank by most chests, best streak, average or matches played, per lobby size, with a gold, silver and bronze podium. The new Your stats page shows your career totals, bests, recent form and a breakdown by lobby size.

Deployment: streaks are computed on the relay. Deploy the updated relay with this version's `match.js` for the new streak rules; until then rooms keep the old rule.

Validation: 37 automated tests pass.
