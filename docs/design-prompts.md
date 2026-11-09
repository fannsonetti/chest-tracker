# Compact MiniHUD proposals

The revised concepts are hand-authored SVG vectors: no image generator, embedded raster data, textures, gradients, glow, or particle effects.

Design brief: compact, minimalist, monochrome gaming overlays with thin SVG line icons and quiet dividers. All three proposals show personal and inclusive team chest counts for the current game, lifetime, and session; personal/team rates per match and hour; token chance; current and best streak; completed games; session duration; and each squad member’s game and lifetime counts. Show actual 224–248px overlay widths. Lifetime totals persist across games; team totals include your own openings once.

- A Outline: stats matrix first, then squad, 224 × 344.
- B Inline: current game and lifetime counts emphasized, with supporting stats, 248 × 348.
- C Ledger: squad game/lifetime table first, then stats matrix, 224 × 344.
- Shared recap: small per-player counts and best consecutive-opening streak.

All standalone designs and the comparison board are in [designs](designs/). Regenerate them with `node docs/designs/generate.cjs`. These are proposals awaiting selection; this design revision does not change the released app. The earlier bitmap concepts remain available in Git history.
