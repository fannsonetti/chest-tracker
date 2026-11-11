# Chest Tracker 1.2.4

- Streaks start at 3 chests in a row, and there are eight flame colours: red, orange (10), yellow (20), blue (30), purple (40), and three rare ones, Celestial (50), Eclipse (75) and Supernova (100).
- The time you have between chests shrinks at every colour: 45, 30, 22, 18, 15, 12, 10 and 8 seconds.
- Being overtaken no longer resets your streak. You lose the lead and can take it back by passing again.
- Solo games have streaks too. Your best solo streak is saved in the recap, the Best streak leaderboard, Your stats and the flame milestones.
- Popups get bigger the rarer the moment. Celestial, Eclipse and Supernova each play their own scene that spills past the pill, and Supernova collapses in on itself before it explodes.
- When your streak runs out, a round pill shows your flame burning down to an ember. The bottom of the flame is no longer cut off.
- Beating the leaderboard's best game for your lobby size shows a record pill. Personal-best and record pills show once per game.
- Leaderboards: This week, This month and Lifetime views, a CPM ranking, a table that shows only the ranked value and related numbers, and controls that line up from the left.
- Your stats shows how many matches reached each flame colour.
- The top-bar streak timer is bright, and your HUD flame flickers while your streak is live.
- Press Num 0 on the Settings page to open a test menu that previews every popup.

Deployment: the new streak rules apply to party games once the relay runs this version's `match.js`. Solo games use them right away.

Validation: 54 automated tests pass.
