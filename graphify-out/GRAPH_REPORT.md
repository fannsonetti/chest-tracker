# Graph Report - .  (2026-11-12)

## Corpus Check
- Corpus is ~49,443 words - fits in a single context window. You may not need a graph.

## Summary
- 473 nodes · 722 edges · 24 communities (22 shown, 2 thin omitted)
- Extraction: 89% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 75 edges (avg confidence: 0.67)
- Token cost: 344,868 input · 0 output

## Community Hubs (Navigation)
- Match & Streak Engine
- Release History & Rules
- Electron Build Config
- Milestone Scene Renderer
- Popup Animations
- Options & Leaderboards
- Hosted Relay Client
- Package Dependencies
- Electron Main Process
- Signed Results & Relay
- MiniHUD Rendering
- Team Sync Tests
- Game Lifecycle & Milestones
- HUD Design Mockups
- Ledger Design Decision
- Mockup Generator Script
- Streak Breaks & Hotkeys
- App Window Pages
- Preload Bridge
- Party Lobbies UI

## God Nodes (most connected - your core abstractions)
1. `OpeningStreaks` - 21 edges
2. `files` - 19 edges
3. `HostedConnection` - 16 edges
4. `show()` - 15 edges
5. `Chest Tracker README` - 13 edges
6. `render()` - 12 edges
7. `countedMatch()` - 11 edges
8. `renderLeaderboards()` - 11 edges
9. `rgba()` - 9 edges
10. `build` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Milestone preview dev page` --references--> `TIER_ORDER`  [EXTRACTED]
  milestones-preview.html → match.js
- `Flame tiers (Ember, Flare, Solar, Plasma, Nebula, Aurora, Quasar, Singularity)` --conceptually_related_to--> `TIER_ORDER`  [INFERRED]
  options.html → match.js
- `Leaderboard points rules (0.25/chest, lead bonus, lobby multipliers)` --conceptually_related_to--> `matchLeaderboards()`  [INFERRED]
  options.html → match.js
- `Milestone reveal kind` --references--> `playMilestone()`  [INFERRED]
  popup.html → milestones.js
- `Ledger MiniHUD design (224x214 SVG reference)` --semantically_similar_to--> `Ledger layout`  [INFERRED] [semantically similar]
  README.md → docs/design-prompts.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Relay-signed anti-tamper points pipeline** — readme_points_leaderboard, readme_signed_match_results, relay_readme_match_signing_key, relay_readme_proof_js, docs_release_notes_1_2_2_result_sharing, relay_compose_relay_service [INFERRED 0.85]
- **Evolution of streak rules across releases** — docs_release_notes_1_1_9_hidden_count_streaks, readme_streak_rules, docs_release_notes_1_2_3_tiered_streak_windows, readme_flame_colours, docs_release_notes_1_2_4_rare_tier_scenes [INFERRED 0.85]
- **MiniHUD design selection lineage** — docs_release_notes_1_1_0_minihud_concepts_v2, docs_release_notes_1_1_1_compact_proposals, docs_design_prompts_ledger_layout, readme_ledger_design, docs_release_notes_1_1_2 [INFERRED 0.85]
- **HUD events dispatched to popup kinds via showPopup** — index_checkstreakbreaks, index_checktierups, index_checkpersonalbest, index_streak_lost_watcher, index_showrecap, popup_page [INFERRED 0.85]
- **Match lifecycle: bump, end, finish, clear, new game** — index_bump, index_endmatch, index_finishmatch, index_clearended, index_newgame, index_startgame [EXTRACTED 1.00]
- **Signed match sharing across party** — index_syncparty, index_sharehistory, match_proofchunks, match_mergesignedmatches [EXTRACTED 1.00]
- **MiniHUD layout alternatives (Outline, Inline, Ledger)** — docs_designs_a_outline_hud, docs_designs_b_inline_hud, docs_designs_c_ledger_hud [INFERRED 0.85]

## Communities (24 total, 2 thin omitted)

### Community 0 - "Match & Streak Engine"
Cohesion: 0.06
Nodes (47): DEF default state, finishMatch(), shareHistory(), showRecap(), Saved state migration v2-v5, asStreak(), careerStats(), countedMatch() (+39 more)

### Community 1 - "Release History & Rules"
Cohesion: 0.05
Nodes (52): release.yml (Build and release Windows app workflow), Publish release step (gh release create), Release notes 1.1.0, A Glass / B Tactical / C Relic concepts, Release notes 1.1.1, A Outline / B Inline / C Ledger proposals, Release notes 1.1.7, Release notes 1.1.8 (+44 more)

### Community 2 - "Electron Build Config"
Cohesion: 0.05
Nodes (42): build, appId, directories, files, nsis, portable, productName, publish (+34 more)

### Community 3 - "Milestone Scene Renderer"
Cohesion: 0.11
Nodes (29): AUR_CURTAINS, auroraBody(), bell(), clamp01(), climb(), curtain(), drawBolt(), flamePts() (+21 more)

### Community 4 - "Popup Animations"
Cohesion: 0.13
Nodes (34): TIER_ORDER, applyOpacity(), bestStage(), brokenStage(), chip(), clock(), countUp(), easeInOut() (+26 more)

### Community 5 - "Options & Leaderboards"
Cohesion: 0.13
Nodes (27): awardBadges(), boardMetric, boardPeriod, cell(), cellFor(), COLUMN_LABEL, configure(), esc() (+19 more)

### Community 6 - "Hosted Relay Client"
Cohesion: 0.12
Nodes (9): HostedConnection, assert, client(), { createRelay }, { HostedConnection, DEFAULT_SERVER }, { once, EventEmitter }, test, WebSocket (+1 more)

### Community 7 - "Package Dependencies"
Cohesion: 0.08
Nodes (24): electron, electron-builder, electron-updater, dependencies, electron-updater, ws, description, devDependencies (+16 more)

### Community 8 - "Electron Main Process"
Cohesion: 0.11
Nodes (20): { app, BrowserWindow, globalShortcut, screen, ipcMain }, buildOptions(), create(), holds, hosted, hudFile(), ICON, keys (+12 more)

### Community 9 - "Signed Results & Relay"
Cohesion: 0.12
Nodes (19): crypto, fs, loadSigningKey(), signResult(), verifyResult(), createRelay(), http, { OpeningStreaks, POINTS_VERSION } (+11 more)

### Community 10 - "MiniHUD Rendering"
Cohesion: 0.10
Nodes (17): Mid-game click-through HUD, KEYS shortcut actions, paired() personal/team display, rankedPlayers(), render(), renderBar(), renderRoster(), renderRows() (+9 more)

### Community 11 - "Team Sync Tests"
Cohesion: 0.11
Nodes (6): assert, fs, onNet(), test, tracker(), vm

### Community 12 - "Game Lifecycle & Milestones"
Cohesion: 0.15
Nodes (12): bump() chest count change, bumpIn(), checkPersonalBest(), checkTierUps(), endMatch(), newGame(), recordSession(), startGame() (+4 more)

### Community 13 - "HUD Design Mockups"
Cohesion: 0.27
Nodes (13): Outline HUD Mockup (A), Inline HUD Mockup (B), Ledger HUD Mockup (C, active streak), Ledger HUD Mockup (C, inactive streak), HUD Dark Panel Style, Ledger Refined Concept Board, Match Recap MiniHUD Mockup, Shared Team Token Chance (+5 more)

### Community 14 - "Ledger Design Decision"
Cohesion: 0.20
Nodes (10): Selected MiniHUD: Ledger (design prompts), CTG and CPM metrics, docs/designs/generate.cjs, Gold leader crown, Ledger layout, Shared team token chance, Release notes 1.1.2, Release notes 1.1.3 (+2 more)

### Community 15 - "Mockup Generator Script"
Cohesion: 0.27
Nodes (9): active, fire(), fs, inactive, ledger(), line(), path, t() (+1 more)

### Community 16 - "Streak Breaks & Hotkeys"
Cohesion: 0.33
Nodes (5): accelFrom() key to accelerator, applyKeys(), checkStreakBreaks(), window.api bridge (HUD), Streak taken pill

### Community 17 - "App Window Pages"
Cohesion: 0.50
Nodes (4): MiniHUD overlay page (index.html), Options window page (options.html), Popup window page (popup.html), Reduced-motion fallbacks

## Ambiguous Edges - Review These
- `Hidden-count takeover streak rule (1.1.9)` → `Party signed-result sharing`  [AMBIGUOUS]
  docs/release-notes-1.2.2.md · relation: conceptually_related_to

## Knowledge Gaps
- **140 isolated node(s):** `fs`, `path`, `active`, `inactive`, `WebSocket` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Hidden-count takeover streak rule (1.1.9)` and `Party signed-result sharing`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `OpeningStreaks` connect `Match & Streak Engine` to `Signed Results & Relay`, `MiniHUD Rendering`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `playMilestone()` connect `Milestone Scene Renderer` to `Match & Streak Engine`, `Game Lifecycle & Milestones`, `Mockup Generator Script`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `TIER_ORDER` connect `Popup Animations` to `Match & Streak Engine`, `MiniHUD Rendering`, `Game Lifecycle & Milestones`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `active` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Match & Streak Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.05669710806697108 - nodes in this community are weakly interconnected._
- **Should `Release History & Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.05297532656023222 - nodes in this community are weakly interconnected._