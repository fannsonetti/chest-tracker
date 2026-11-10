# Chest Tracker 1.2.0

- New points leaderboard. Every chest is worth 10 points, plus 10% per level of your live streak, times the lobby size when you opened it: solo 1x, duos 2x, trios 3x, squads 4x (bigger custom lobbies stay at 4x). Solo has no streaks, so no streak bonus. Leaderboards rank by Points by default and have a new All tab that compares every lobby size together.
- Party points are scored by the relay from its own log of openings and each match result is signed by the relay. The app only counts party points whose signature checks out, so editing saved history or faking a recap earns nothing. Corrections remove the points for those chests. Solo points are your chests x 10. Matches from before this version have no signature and earn no party points.
- Holding a hotkey counts once. Each chest needs its own press.
- The team chest keys and +/- buttons are gone. Team chests come only from your teammates' own counts; the HUD's +/- buttons always change your own chests.
- CPM (chests per match) and the averages on the leaderboards and Your stats skip matches where you opened fewer than 5 chests. Team CPM uses the same rule on the team total. Your current CPM is recalculated from your saved matches.

Deployment: party points need the updated relay (this version's `match.js`, `proof.js` and `relay/server.js`) running with its signing key. See `relay/README.md`.

Validation: 41 automated tests pass.
