# Chest Tracker 1.2.2

- New streak rules. Everyone runs their own streak at once: each chest within 90 seconds of your last one adds 1, and a longer gap starts you over. The leader (the biggest live streak) only gets 60 seconds between chests. Passing the leader takes the lead and drops them to 0, so they cannot take it straight back. When the leader's streak runs out, the next biggest takes over. The MiniHUD shows your own streak and the leader's, with the time left.
- Flames change colour as streaks grow: blue at 10, purple at 25, and a rainbow flame at 50. A pill shows when your streak or the leader's reaches a new colour.
- Everyone in the room sees a pill when the lead changes hands. A new gold pill shows when you pass your best counted game (it can be turned off in Overlay).
- Points rescaled: 0.25 per chest, plus 10% per streak level only while you lead, times the lobby size. In party games the first and last chest each earn 1 point times the lobby size. Older signed results count at 1/40 so they match the new scale. Leaderboards show whole points.
- Games only count when they last at least 3 minutes and the team opens at least 5 chests. Shorter games are no longer saved, numbered or recapped, and their chests come off your lifetime and session totals. On upgrade, saved games are renumbered and short ones are removed.
- Party members now share their relay-signed results with each other, so everyone's leaderboards hold the same matches. Synced games are marked in Matches, which also shows First chest, Last chest and streak badges.
- After a game's recap finishes, the MiniHUD shows the next game at zero.

Deployment: the new streak rules, timers, awards and result sharing need the updated relay (this version's `match.js`, `proof.js` and `relay/server.js`). This app still works with older relays and shows their single-holder streaks.

Validation: 52 automated tests pass.
