# Chest Tracker 1.3.1

- New notification sounds. Every flame milestone, streak death, overtake (both winning and losing the lead), Personal Best and Leaderboard Record has its own sound, timed to its animation. Each flame colour has its own sound, and its death and overtakes are built from it.
- Settings › Popups & sound has a new Legacy Notification Sounds switch (off by default) that brings back the original sounds exactly as they were.
- With the new sounds, a lead change between two other players, or another player's streak running out, plays quietly. These used to be silent.
- Streaks are easier to keep going: the time between chests starts at 60 seconds and shrinks to 55, 50, 45, 40, 35, 30 and 30 seconds as the flame climbs.
- Flame colours come sooner: Flare at 6, Solar 9, Plasma 12, Nebula 15, Aurora 20, Quasar 25 and Singularity 30. Being overtaken still drops your streak to the start of the colour below.

Deployment: the new streak timings apply to party games once the relay runs this version's `match.js`. Solo games use them right away.

Validation: 58 automated tests pass.
