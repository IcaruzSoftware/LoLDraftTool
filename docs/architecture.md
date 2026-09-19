# Architecture

Decided stack, layout and engine design for LoLDraftTool v1. See [../discovery.md](../discovery.md) for the decision rationale and open assumptions, and [data-schema.md](data-schema.md) for the full data schema.

## Stack

- **Frontend**: Vite 6 + React 19 + TypeScript strict. State via `useReducer` + context — no Redux/Zustand. CSS modules or plain CSS with variables, dark-gold LoL-like theme. Vitest for tests. Package manager: pnpm.
- **Engine**: pure TypeScript in `app/src/engine`. Zero DOM/React imports. Fully unit tested.
- **Shell**: `host/` is a .NET 10 WPF project hosting WebView2 (`Microsoft.Web.WebView2` NuGet). It maps virtual host `https://app/` to a `wwwroot` folder containing the Vite build output. Dev mode: an env var or launch arg points WebView2 at `http://localhost:5173` for HMR. Publish: `dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true` (~70 MB) and a framework-dependent variant (~3 MB, needs the .NET 10 Desktop Runtime on the target). Tauri v2 is a documented alternative deferred because of the incomplete MSVC toolchain on the dev machine — see [research/tech-stack.md §5.1](research/tech-stack.md#51-one-time-toolchain-install-tauri) and the decisions log in [discovery.md](../discovery.md#3-decisions-log).
- **Platform rule**: the UI touches platform capabilities only via `app/src/platform/index.ts` (`pickAndReadTextFile()`, `saveTextFile()`, implemented with `<input type="file">`/`FileReader` and a download/blob). No shell-specific API is used anywhere else, so the shell (WPF+WebView2 today, Tauri later) can be swapped without touching UI or engine code.

## Repository layout

```
LoLDraftTool/
  discovery.md
  README.md
  docs/ (architecture.md, build-plan.md, data-schema.md, research/)
  app/                      Vite React TS app
    src/engine/             draft state machine, analysis, scoring (pure TS)
    src/data/               typed loaders for bundled JSON
    src/import/              parsers: team pool JSON/CSV, opponents JSON/CSV/op.gg paste
    src/ui/                  React components (Setup, DraftScreen, TeamColumn, BanRow, CenterPanel, RecommendationCard, ChampionGrid, RestartDialog)
    src/platform/            file access adapter
    src/state/               app reducer, persistence (localStorage)
    public/data/champions.json, public/data/meta.json (generated)
    public/champions/*.png   (generated, ddragon squares)
    test/ or colocated *.test.ts
  data/
    curated/tags.json       hand-curated behavioural tags per champion (per-role overrides)
    curated/synergies.json  sparse edges
    curated/counters.json   sparse lane/role matchup edges
    curated/meta.json       per-patch tier + ban priority + common role weights overrides
    samples/team-pool.json, team-pool.csv, opponents.json, opponents.csv
  scripts/
    fetch-data.ts           build-time: ddragon versions+champion.json+icons, cdragon champion-summary + champions/{id}.json, Meraki champions.json -> merge -> app/public/data/champions.json + meta.json
    validate-data.ts        every champion has curated tags; referenced ids exist; schema check
  host/                     WPF WebView2 host (LoLDraftTool.Host.csproj)
  package.json (root scripts: dev, build, test, fetch-data, validate-data, host:run, host:publish)
```

## Data model

See [data-schema.md](data-schema.md) for the full record shapes. Summary: a generated+curated Champion record (identity, positions, damage/attack type, playstyle ratings, curated behavioural tags, per-role meta), a per-patch Meta table, sparse Synergies and Counters edge lists, and two import formats (team pool, opponents).

## Engine design

The engine is the core of the tool: a pure-TypeScript, deterministic, fully explainable rule engine. No component ever introduces randomness; every scoring component that contributes materially to a result logs a human-readable reason string.

### Draft state machine

- `DraftFormat`: `'tournament' | 'ranked'`. `Side`: `'blue' | 'red'`. `Team`: `'us' | 'them'`.
- **Tournament step table** (20 steps, mapped from blue/red to us/them by side — see [research/domain.md §1.1](research/domain.md#11-tournament-draft-clash-professional-play-most-amateur-leagues)):
  `[ban B, ban R, ban B, ban R, ban B, ban R, pick B, pick R, pick R, pick B, pick B, pick R, ban R, ban B, ban R, ban B, pick R, pick B, pick B, pick R]`.
- **Ranked**: 10 ban slots (5 us, 5 them), entered in any order within one "ban phase" (cross-team duplicates allowed), then picks `[B, R, R, B, B, R, R, B, B, R]`.
- **State**: `format`, `side`, `steps[]`, `cursor`, `bans: { us: id[], them: id[] }`, `picks: { us: { id, role? }[], them: { id }[] }`, `fearlessUnavailable: id[]`, action history for undo.
- **Actions**: `applyAction(champion)`, `undo`, `jumpTo(step)`, `setRole(pick, role)`, `restart`.
- **Availability**: a champion is unavailable if banned, picked, or in the `fearlessUnavailable` set.

### Enemy role inference

Given the enemy's picked champions and their position weights, find the assignment of distinct roles that maximizes the product of weights (brute force over open roles, ≤5!). Output per pick: inferred role + confidence, and the set of remaining open enemy roles. Our own roles come directly from the team pool — a pick belongs to the role whose pool contains it, with a manual override available.

### Team profile & archetype detection

- `profile(team)`: per-tag sums, AD/AP counts (mixed counts 0.5 each), frontline count, CC score, early/mid/late sums, global count.
- Archetype scores (0-1) for: engage, protect, poke, pick, dive, split, counterEngage, global, earlySnowball, lateScaling. Thresholds come from [research/domain.md §5.2](research/domain.md#52-proposed-schema-conceptual-one-record-per-champion-role-specific-overrides-where-noted) (e.g. `global = count(global ∨ semiGlobal) >= 3`), normalized so partial comps produce partial confidence. Primary archetype = argmax, if its score is above 0.5.
- The RPS matrix ([research/domain.md §2.1](research/domain.md#21-archetypes)) maps the enemy's detected archetype to desired/undesired tag weights for our own comp.
- Hygiene warnings ([research/domain.md §2.3](research/domain.md#23-hygiene-rules-suitable-for-a-rule-engine)) surface as human-readable text and also feed a "needs" weight vector: what our comp currently lacks (AD/AP balance, frontline, engage or disengage, hard CC, waveclear, anti-tank if enemy frontline ≥ 2, anti-heal if enemy sustain ≥ 2).

### Pick scoring

For each open role of ours and each available champion in our pool for that role, score is a weighted sum of components. Each component that contributes materially produces a reason string.

| Component | Rule |
|---|---|
| poolTier | comfort +3.0, good +1.8, okay +0.8 (comfort strongly preferred — comfort beats "counter" roughly 80% of the time per [research/domain.md §3.1](research/domain.md#31-how-lane-counters-work-per-role)) |
| meta | per-position tier S +1.0 … D −0.5 |
| needs | dot(champion tags, needs weights) — fills what our comp lacks |
| counterComp | dot(champion tags, RPS desired weights for enemy primary/secondary archetype) minus undesired |
| laneMatchup | if the enemy champion in the same role is known: +1.5×strength if we counter it, −1.5×strength if it counters us (`counters.json`); role-scaled (top ×1.0, mid ×0.7, jungle ×0.5, bot ×0.5, support ×0.5) |
| blindRisk | if the enemy's counterpart role is still open: −(counterSensitivity×0.5) + (blindSafe×0.3); weighted more heavily early in the draft |
| synergy | sum of synergies with our locked picks (+0.7×strength) |
| flexValue | for early picks (our first 2): +0.4 if the champion has ≥2 flex roles (hides information) |
| damageProfile | penalty if the pick pushes us to ≥4 champions of the same damage type |
| fearless/pool depth | v1: availability only |

Output: a ranked list. Top result is the recommendation; next 2 are alternatives. Each carries a role and its top 3 reasons. The center panel also gets a "comp target" text (e.g. "Target: Protect-the-carry vs. their Global comp").

### Ban scoring

For every available champion (all champions, not just our pool):

| Component | Rule |
|---|---|
| targetBan | opponent data: for the enemy's open roles, champion games-share and win rate (up to +3.0), strongest against OTPs |
| metaBan | `banPriority` (+0..1.5), scaled up when no opponent data is available |
| protectBan | champion counters our locked picks or our comfort picks in open roles (`counters.json`), +1.2×strength; also hard engage/dive when our plan is Protect |
| denyArchetype (ban phase 2) | champion would raise the enemy's primary archetype score — dot product with the enemy profile direction, up to +1.5 |
| ownWant | −1.0 if it's one of our comfort picks for an open role and the enemy is unlikely to take it before we pick; treated as a protect-our-pick concern only when the enemy acts before our next pick |

Output format matches picks: ranked list with reasons.

### Determinism & explainability

No randomness anywhere in the engine. Every scoring component logs to `reasons[]`. Tests assert on concrete scenarios, including the Nocturne+Galio+Shen scenario from [research/domain.md §6](research/domain.md#6-worked-example-enemy-locks-nocturne-galio-shen): expect the Global archetype to be detected, peel/disengage/spell-shield champions to be ranked up, and ban phase 2 to propose remaining globals (Twisted Fate, Pantheon, Ryze, Karthus).

## UI design

- **Screen 1 — Setup**: format (Tournament/Ranked), side (Blue/first pick vs. Red), import team pool (file), import opponents (file or paste), fearless-unavailable list (optional), Start.
- **Screen 2 — Draft** (mirrors LoL champ-select): header shows the current step text ("Ban 3 — Red team banning") in place of the client's "Declare your champion" banner. Ban rows top-left (ours) and top-right (theirs), 5 slots each. Left column: our 5 picks (role icon, champion, player name). Right column: their 5 picks (inferred role + confidence). Center panel: comp-target line + hygiene warnings, a large RecommendationCard (champion square, role, reasons) with 2 smaller alternatives below. Below that: champion grid with text search, role filter, and a "show pool only" toggle — clicking applies the champion to the current step (banned/picked/unavailable entries are greyed out). Footer: Undo, Restart (confirmation dialog), step progress indicator.
- Our team is always on the left; blue/red is indicated by colour accents only (see [discovery.md §4](../discovery.md#4-open-questions--assumptions-made-on-the-users-behalf)).
- Keyboard: Enter applies the top recommendation; typing focuses the search box.

## Testing strategy

Vitest unit tests for: the state machine (exact step order in both formats), role inference, archetype detection, and pick/ban scoring scenarios; parser tests against the sample files in `data/samples/`; a data-validation script (`scripts/validate-data.ts`) run as part of `pnpm test`. UI gets a minimal smoke test with `@testing-library/react` covering Setup → Draft.

## Build & run

```
pnpm i
pnpm fetch-data     # network, dev-time only
pnpm dev
pnpm test
pnpm build
dotnet run --project host          # dev, points at localhost or dist
dotnet publish host -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

Include the Legal Jibber Jabber notice in the About screen / README (see [research/data-sources.md §6](research/data-sources.md#6-licensing-summary)).
