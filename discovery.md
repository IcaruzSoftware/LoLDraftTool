# Discovery Log

> Living document. Updated as the project proceeds — append to the decisions log, don't rewrite history.

## 1. Product summary

LoLDraftTool is an offline Windows desktop app that mirrors the League of Legends champion-select layout for a team preparing its own drafts. The user imports their team's champion pool (tiered per role: comfort/good/okay) and, optionally, scouted opponent data. The app then walks chronologically through the correct ban/pick sequence for the chosen draft format, recommending the best ban or pick at each step with a short reason and 1-2 alternatives, while continuously evaluating the team's emerging composition against the enemy's. The user can override any recommendation via a searchable champion grid at any point, and can restart the draft (with a confirmation prompt) at any time. All recommendations are produced by a deterministic, explainable rule engine — no AI/LLM, no network calls at runtime.

## 2. Key findings

Draft orders and formats — [research/domain.md §1](docs/research/domain.md#1-draft-formats-and-exact-chronological-order):
- Tournament Draft (primary target): bans 3-3 alternating, blue first (B R B R B R); picks 1-2-2-1 (B1, R1 R2, B2 B3, R3); bans 2-2 alternating, red first (R B R B); picks 1-2-1 (R4, B4 B5, R5). 20 steps total, fully sequential, every ban/pick revealed on lock.
- Ranked Draft Pick: declare-intent phase (hover, ally-visible), one simultaneous hidden ban window (5 bans/team, cross-team duplicates allowed → 8-10 unique bans), reveal, then picks 1-2-2-2-2-1 alternating starting blue (B1, R1 R2, B2 B3, R4 R5, B4 B5, R5).
- Fearless Draft (tier-1 pro standard since 2025): per-series "unavailable" set — a champion played by either team is locked out for the rest of the series (soft fearless: locked only for the team that played it).
- First Selection (2026): winning team chooses side *or* pick order, decoupled from each other; doesn't change the step table, only which side is "first pick."

Team composition theory — [research/domain.md §2](docs/research/domain.md#2-team-composition-theory):
- Ten archetypes recur across sources: Teamfight/Engage, Protect-the-carry, Poke/Siege, Pick/Catch, Dive, Split push, Counter-engage/Disengage, Early-snowball, Late-scaling, Global/Roam.
- A rock-paper-scissors table exists: Engage beats Poke/Pick, loses to Protect/Split; Protect beats Engage/Dive, loses to Poke/Split; Poke beats Protect/Split, loses to Engage/Dive; Pick beats Split/Poke, loses to Engage/Protect; Split beats Protect/Counter-engage, loses to Pick/Engage.
- Hygiene checklist every coaching source repeats: AD/AP balance (≥2 real sources each), ≥1 frontline, reliable engage OR disengage, sufficient hard CC, waveclear, one coherent win condition, sane power curve vs. the enemy.
- Counterpick value is role-dependent: top highest (isolated 1v1 lane), mid medium (roaming dilutes it), jungle/ADC/support low (map-interactive) — hence those roles are picked early and top/mid are saved for the last counterpick slots (R3, B5, R5).
- Flex picks (Gragas, Sett, Pantheon, Galio, Karma, Senna, Sylas, Irelia, Ornn, …) deny the opponent a counterpick because the lane is unknown until locked; ideal for B1/R1/R2.
- Ban types: target bans (opponent comfort/OTP), meta/OP bans (patch outliers), protect bans (remove hard counters to our plan/locked picks), phase-2 "cut the remaining roles" bans (deny the enemy's emerging archetype).

Data sources — [research/data-sources.md](docs/research/data-sources.md):
- Riot Data Dragon (ddragon): coarse per-champion `tags`, `info` ratings, base stats, square icons — official, stable, versioned.
- Community Dragon (cdragon): adds `roles`, `championTagPrimary/Secondary`, `tacticalInfo.damageType`/`attackType`, `playstyleInfo` (damage/durability/crowdControl/mobility/utility, 1-3).
- Meraki Analytics CDN: adds `positions` (TOP/JUNGLE/MIDDLE/BOTTOM/SUPPORT) — the only free source of lane positions — plus fine-grained roles and `attributeRatings`.
- LoL Wiki's 13 subclasses (Vanguard, Warden, Juggernaut, Diver, Burst, Battlemage, Artillery, Assassin, Skirmisher, Enchanter, Catcher, Marksman, Specialist) are the best free semantic taxonomy but require a one-off scrape/hand-copy (~170 rows, no API).
- Kaggle `luisfmcuriel/league-of-legends-team-compositions-dataset` verdict: 2020 (patch 10.16-10.18) solo-queue data, one-hot encoded, no positions, no player data. Usable only as a unit-test fixture, not a production data source — six years stale, too thin per champion pair.
- No free, licensed, ready-made counter/synergy matrix exists (LoLalytics/u.gg/op.gg/Mobalytics all block or prohibit scraping). Response: curated counters/synergies (team's own pool, hand-maintained) plus rule-based heuristics from bundled attributes.
- op.gg has no export and no official public API; the Champions tab is scrapeable only by manual copy-paste. v1 response: paste/CSV/JSON import, no scraping infrastructure.
- Licensing: Riot's "Legal Jibber Jabber" policy permits bundling ddragon (and, in practice, cdragon/Meraki) data and icons in a non-commercial fan project with a verbatim disclaimer; op.gg/u.gg/LoLalytics/Mobalytics numbers must never be bundled.

Toolchain — [research/tech-stack.md](docs/research/tech-stack.md):
- Tauri v2 was the top-scoring option but requires installing the MSVC C++ workload, which is only partially present on the dev machine (no usable `cl.exe`/`link.exe`, no Windows SDK libs) — a 25-45 minute one-time install.
- .NET 10 WPF hosting WebView2 needs zero new installs (dotnet 10 SDK and WebView2 runtime already present) and scored within two points of Tauri. Chosen as the shell for v1 to avoid the toolchain blocker; Tauri is documented as the deferred alternative, reachable later without touching the frontend or engine because platform access is isolated behind one adapter module.
- Electron was rejected: ~85-100 MB installer contradicts "lightweight."

## 3. Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-19 | Frontend/engine stack: Vite 6 + React 19 + TypeScript strict, pure-TS engine, Vitest | Best productivity for a styled, image-heavy grid UI; engine stays DOM-free and unit-testable regardless of shell. |
| 2026-09-19 | Shell: .NET 10 WPF hosting WebView2, not Tauri | Zero new toolchain installs vs. Tauri's blocked MSVC/Windows SDK setup on this machine ([tech-stack.md §2](docs/research/tech-stack.md#2-what-is-installed-on-the-developer-machine-verified-2026-09-19)); scored within 2/65 of Tauri ([tech-stack.md §3.7](docs/research/tech-stack.md#37-scorecard-higher--better-weighted-for-this-project)). Platform access isolated behind `app/src/platform/index.ts` so a later switch to Tauri is a shell-only change. |
| 2026-09-19 | Engine approach: deterministic, weighted-component scoring with per-recommendation reason strings; no AI/LLM, no randomness | Matches the user's explicit "purely algorithmic" requirement; explainability is a first-class output, not an afterthought. |
| 2026-09-19 | Data approach: build-time merge of ddragon + cdragon + Meraki into one `champions.json`, plus a hand-curated behavioural-tags file for the ~170 champions | No single free source has both positions and behavioural tags; automation covers ~60% of the schema, the rest needs one curated pass ([domain.md §5.2](docs/research/domain.md#52-proposed-schema-conceptual-one-record-per-champion-role-specific-overrides-where-noted)). |
| 2026-09-19 | v1 scope: Tournament Draft primary, Ranked modelled as a degenerate case; opponent import via JSON/CSV/paste only; counters/synergies curated-sparse, not a full matrix | Keeps v1 honest and shippable; avoids scraping and stale/thin third-party stats. |
| 2026-09-19 | Deferred to v2+: Tauri shell, Riot API opponent import (user-supplied key), online counter-stat refresh (OP.GG MCP or Riot API), Leaguepedia pick-order ingestion | All require either a toolchain install, a user credential, or network access at runtime — out of scope for an offline v1. |
| 2026-09-19 | Shell built as .NET 10 WPF + WebView2 (host/) rather than Tauri | Confirms the earlier stack decision: the MSVC/Windows SDK toolchain needed for Tauri was still not usable on the dev machine when step 7 was implemented. |
| 2026-09-19 | State management: React `useReducer` + context, no external state library | Matches the architecture decision; draft state, undo history and setup state all fit one reducer without added dependencies. |
| 2026-09-19 | Curated behavioural tags (`data/curated/tags.json`) authored for all 173 champions | Full ddragon/cdragon/Meraki champion roster at time of `fetch-data`; no partial-coverage fallback needed in the engine. |
| 2026-09-19 | `antiHeal`/`antiShield` curated as `false` for almost every champion, with Katarina a deliberate `true` exception | Most champions have no meaningful anti-heal/anti-shield tool; flagging only clear cases (e.g. Katarina's passive) keeps the tag meaningful for scoring instead of diluted. |
| 2026-09-19 | `global`/`semiGlobal` convention: `global` = map-wide threat with no real travel cost (teleport-like ultimates, e.g. Shen), `semiGlobal` = fast but not instant map presence (e.g. Nocturne) | Lets archetype detection treat the two as different-strength signals instead of one boolean, per the Nocturne (semiGlobal) vs. Shen (global) calibration in [research/domain.md §6](docs/research/domain.md#6-worked-example-enemy-locks-nocturne-galio-shen). |
| 2026-09-19 | Global archetype detection uses a champion-count threshold (3 global/semiGlobal champions ≈ score 1.0), with primary-archetype promotion when the score is highest and above 0.5 | Simple, explainable rule that matches the worked Nocturne+Galio+Shen scenario without needing per-tag calibration weights. |
| 2026-09-19 | Ban score weights capped: protect-ban strength ×2.4 max, phase-1 (target/meta) damping ×0.6, meta-ban score 2.5/1.5/0.5 tiers when no opponent scouting data is available | Keeps target bans dominant once scouting data exists, while still giving a sane meta-only fallback ranking when it doesn't; caps prevent any single component from swamping the ranked ban list. |
| 2026-09-19 | Published self-contained exe is ~126 MB; framework-dependent alternative (needs .NET 10 Desktop Runtime on target) is ~3 MB | Confirmed via `pnpm host:publish` and `host/README.md`; the size gap is almost entirely the bundled .NET desktop runtime + WebView2 loader. |

## 4. Open questions / assumptions made on the user's behalf

- **Tournament Draft is the primary format**; Ranked is modelled as a degenerate case of the same state machine (one ban window instead of two, picks 1-2-2-2-2-1 instead of 1-2-2-1/1-2-1). Assumed because the user described a team-vs-team prep tool, not solo queue.
- **Our team is always shown on the left** column regardless of map side (blue/red); side is indicated by colour accent only. Assumed for UI consistency across games/sides.
- **The meta tier list (`data/curated/meta.json`) is a curated, editable file**, not fetched live — there is no free authoritative source, and this keeps the tool offline.
- **Counters (`data/curated/counters.json`) are curated and intentionally sparse** (top/mid focus, notable bot/support edges), not a full N×N matrix — no free licensed source exists, and a hand-curated set is more trustworthy than a scraped one.
- **Opponent data import is JSON/CSV/paste only for v1** — op.gg has no export or public API; Riot-API-based import is deferred to v2 pending a user-supplied key.
- **UI language is English.** No localization requested; ddragon/cdragon data is pulled in `en_US`.
- **Fearless is modelled as a single per-series unavailable-champion set** (hard fearless default), with soft fearless as a per-team variant, not built into v1 unless requested.
- **Turn timers are not modelled** — the tool has no live game-state feed; the user drives it manually, one action at a time.

## 5. Glossary

| Term | Meaning |
|---|---|
| B1, R1, … | Blue pick 1, Red pick 1, etc. — draft step labels. |
| Comfort / Good / Okay | Team-pool tiers per champion per role, user-supplied. |
| Fearless | Series-level rule: champions already played become unavailable in later games. |
| Flex pick | A champion viable in 2+ roles, hiding lane assignment from the opponent. |
| Archetype | A team-comp identity (Engage, Poke, Protect, Pick, Dive, Split, Counter-engage, Global, …) detected from aggregate champion tags. |
| Hygiene check | A comp-quality rule (damage balance, frontline, CC, waveclear, …) independent of archetype. |
| ddragon / cdragon | Riot Data Dragon / Community Dragon — Riot's official and community-mirrored static game-data feeds. |
| Meraki | Third-party CDN providing champion lane positions and fine-grained roles, absent from Riot's own feeds. |

## 6. Build log / status (2026-09-19)

Steps 1-7 of [docs/build-plan.md](docs/build-plan.md) are done: scaffold, data
pipeline, curated data, engine, importers, UI, and host. `pnpm test` passes: 75
tests passed, 2 skipped, across 12 passed test files (1 file fully skipped). Step 9 (integration review) done: full tournament and ranked drafts walked through in the browser, both sides; engine retuned twice from the findings (global detection, ban weights, archetype confidence cap, own-pick ban penalty).
`pnpm validate-data` confirms 173 champions validated, 123 curated synergy
edges and 232 curated counter edges cross-checked. `pnpm build`, `pnpm
typecheck`, `pnpm lint` and `dotnet build host -c Debug` all exit 0.

Known limitations:

- Curated data (`data/curated/*.json`) is expert-estimated, not derived from
  statistics — there is no free, licensed source for synergy/counter matrices
  (see [§2 Data sources](#2-key-findings)).
- Newly-added champions (Locke, Yunara, Zaahen) have low-confidence curated
  tags — too little played history to calibrate behavioural tags and
  win-rate-driven meta tiers with real confidence.
- Ranked mode bans are modelled as 5+5 simultaneous slots per team (10 unique
  or fewer after cross-team duplicates), not the client's true hidden-hover
  mechanic.
- There is no per-player role lock for opponents beyond what's supplied at
  import — if an opponent's import data doesn't tag a player's role, role
  inference falls back to the same enemy-role-assignment heuristic used for
  their picks.
- UI has been manually verified at 1280x800; no responsive/smaller-window
  testing has been done.
