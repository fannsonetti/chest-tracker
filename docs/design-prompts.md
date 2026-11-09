# Selected MiniHUD: Ledger

The user selected the third layout, then removed the statistics they did not need.

The refined SVG reference is 224 × 214 pixels and shows:

- Squad member name, chests this game, and current consecutive-opening streak.
- A thin fire SVG: muted warm color for an active streak; grey with zero when inactive.
- Personal/team chests this game and chests per match.
- One shared team token chance below the squad.

Lifetime totals, session counts, hourly rates, completed-game/session-duration labels, and the “Team includes you” footer are omitted. The comparison board shows the selected layout in active and inactive streak states.

These are editable SVG vectors, with no raster images, glow or particle effects. Regenerate the selected references with `node docs/designs/generate.cjs`. The earlier A/B alternatives remain in this folder as historical proposals; they are not used by the current HUD.

The chosen Ledger layout is implemented in app version 1.1.2.
