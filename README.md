# LoLDraftTool

[![CI](https://github.com/IcaruzSoftware/LoLDraftTool/actions/workflows/ci.yml/badge.svg)](https://github.com/IcaruzSoftware/LoLDraftTool/actions/workflows/ci.yml)

An offline Windows desktop app that mirrors the League of Legends champion-select
screen for a team preparing its drafts. Import your team's champion pool and,
optionally, scouted opponent data, and the app walks you chronologically through
the correct ban/pick order, recommending the best ban or pick at every step with
a short, human-readable reason. Everything is computed by a deterministic rule
engine — no AI/LLM, no network calls at runtime.

Features:

- Tournament Draft and Ranked Draft, both correct step-by-step orders, either side
- Fearless-set support (champions already used in the series are marked unavailable)
- Team pool import with comfort/good/okay tiers per role
- Opponent scouting import (JSON, CSV, or an op.gg "Champions" tab paste)
- Algorithmic pick/ban recommendations with explained reasons and 2 alternatives
- Team composition archetype detection and comp-hygiene warnings
- Full manual override via a searchable, filterable champion grid
- Undo, restart, and export of the current draft
- Fully offline, no AI/LLM involved anywhere

## Quick start

### Prerequisites

- Windows 10/11
- Microsoft Edge WebView2 Runtime — preinstalled on Windows 11 and with current
  Edge installs; otherwise <https://developer.microsoft.com/microsoft-edge/webview2/>
- Only if you run the framework-dependent build (see below): the **.NET 10
  Desktop Runtime**, which Windows does not ship by default

### Run the published exe

Download or build `LoLDraftTool.exe` (see [Build & publish](#build--publish)),
then double-click it. The self-contained build needs nothing else installed.

### Run from source

```powershell
pnpm install
pnpm build
dotnet run --project host          # opens the packaged app in a window
```

For development with hot reload, run these in two terminals:

```powershell
pnpm dev            # terminal 1: Vite dev server
pnpm host:run        # terminal 2: WPF host pointed at the dev server
```

Or skip the desktop shell entirely and open <http://localhost:5173> in a browser
after `pnpm dev`.

## Usage walkthrough

### Setup screen

- **Format & side**: choose Tournament Draft or Ranked Draft, and Blue (first
  pick) or Red.
- **Team pool**: "Import team pool (JSON/CSV)" or "Use demo pool" to try the app
  without your own data. The loaded pool is shown as a table per role.
- **Opponents (optional)**: "Import opponents (JSON/CSV)", or paste an op.gg
  Champions-tab table with a player name and role and click "Add from op.gg
  paste". Multiple players can be added this way.
- **Import opponents from an op.gg multi-search link**: paste an op.gg
  multi-search URL (`op.gg/lol/multisearch/<region>?summoners=Name%23TAG,…`) and
  click "Fetch" to pull each summoner's most-played champions (current-season
  ranked games and win rates) directly from op.gg. This is the app's only online
  feature — it is opt-in (nothing is fetched until you click Fetch), replaces any
  previous opponents, and may break if op.gg changes its page. Set each player's
  role from the dropdown afterwards.
- **Fearless unavailable (optional)**: a comma-separated list of champions
  already used earlier in the series.
- **Start Draft** begins the draft.

### Draft screen

Mirrors LoL champ-select. **Our team is always shown on the left**, regardless
of which map side (blue/red) we're on — side is indicated by a colour badge
only.

- Ban rows at the top: our bans on the left, the opponent's on the right.
- Left column: our 5 picks, with inferred/assigned role.
- Right column: the opponent's 5 picks, with an inferred role and confidence.
- Center panel: the comp-target line, detected archetypes and hygiene
  warnings, a large recommendation card, and up to 2 smaller alternatives —
  each with its role and top reasons.
- Champion grid below the recommendation: search by name, filter by role,
  "Pool only" to show just your imported pool, "Skip / no ban" during ban
  steps. Clicking a champion applies it to the current step; on our turn this
  locks in a pick/ban ("Lock in" / "Ban"), on the opponent's turn it records
  what they did.
- Footer: **Undo** (steps back one action; undoing an earlier slot confirms
  first if it would discard later ones), **Restart** (clears picks/bans, keeps
  setup, asks for confirmation), **Back to setup** (discards the draft, asks
  for confirmation), **Export draft** (saves the draft state as JSON).

### How recommendations are computed

No AI — a weighted-component scoring engine. Every component that contributes
adds a plain-language reason to the recommendation.

**Picks** are scored per open role from these components: comfort/good/okay
pool tier, current patch meta tier, what our comp still needs (AD/AP balance,
frontline, CC, waveclear, …), how well the champion counters the enemy's
detected comp archetype, the lane matchup against the enemy's champion in the
same role, blind-pick risk when the enemy's counterpart role is still open,
synergy with our locked picks, flex value (hiding our lane) on early picks,
and a penalty for over-stacking one damage type.

**Bans** are scored from: how much of a target ban it is against scouted
opponent data, its meta/ban-priority tier, whether it protects our locked or
comfort picks from being countered, and whether it would deny the enemy's
emerging archetype.

## Import formats

### Team pool

JSON — role keys are tolerant (`Toplane`/`top`, `jgl`/`jungle`, `midlane`/`mid`,
`adc`/`bot`/`bottom`, `supp`/`support`), champion names are fuzzy-resolved
(`"Kaisa"` → Kai'Sa, `"MF"` → Miss Fortune):

```json
{
  "Toplane": {
    "player": "Alex",
    "comfort": ["Aatrox", "Camille"],
    "good": ["Gnar", "Jax"],
    "okay": ["Ornn"]
  }
}
```

CSV equivalent, `role,tier,champion,player`:

```csv
role,tier,champion,player
top,comfort,Aatrox,Alex
top,good,Gnar,Alex
```

### Opponents

JSON — `winrate` (0-1 fraction or 0-100 percent) is accepted instead of `wins`:

```json
{
  "players": [
    {
      "name": "Toplaner#EUW",
      "role": "top",
      "champions": [{ "name": "K'Sante", "games": 48, "wins": 27 }]
    }
  ]
}
```

CSV equivalent, `player,role,champion,games,wins` (a `winrate` column also
accepted):

```csv
player,role,champion,games,wins
Toplaner#EUW,top,K'Sante,48,27
```

**op.gg paste**: open the player's profile, go to the **Champions** tab, and
copy the whole table (including the leading totals row — it is ignored) into
the paste box on the Setup screen. Each row yields `games = W + L`,
`wins = W`; op.gg doesn't include the player name or role in the table, so
enter those separately before adding the paste.

Sample files for all of the above live in [`data/samples/`](data/samples/).

## Data & maintenance

Champion data comes from Riot Data Dragon, Community Dragon, and the Meraki
Analytics CDN, merged at build time by `pnpm fetch-data` (network; run once per
patch). The curated files in `data/curated/` (`tags.json`, `meta.json`,
`synergies.json`, `counters.json`) are hand-maintained, plain-JSON and safe to
edit directly. After editing them, run `pnpm validate-data` to check every
champion has curated tags and every referenced id exists; `pnpm sync-curated`
copies the curated files into the app and runs automatically before `pnpm dev`
and `pnpm build`.

## Project layout

```
LoLDraftTool/
  discovery.md            decision log and open assumptions
  docs/                   architecture.md, build-plan.md, data-schema.md, research/
  app/                    Vite + React + TS app
    src/engine/           draft state machine, scoring, archetype detection
    src/data/             typed loaders for bundled JSON
    src/import/            team-pool / opponent parsers
    src/ui/                Setup, DraftScreen and supporting components
    src/platform/          file-access adapter (isolates shell-specific APIs)
    src/state/             app reducer, persistence
  data/
    curated/              hand-maintained tags/meta/synergies/counters
    samples/               example import files
  scripts/                 fetch-data, validate-data, sync-curated
  host/                    WPF + WebView2 desktop shell
```

See [`docs/architecture.md`](docs/architecture.md) for the full engine design,
[`docs/data-schema.md`](docs/data-schema.md) for record shapes, and
[`docs/build-plan.md`](docs/build-plan.md) for how it was built.

## Build & publish

```powershell
pnpm host:publish
```

Produces a self-contained, single-file exe at
`host/bin/Release/net10.0-windows/win-x64/publish/LoLDraftTool.exe` (roughly
**126 MB**, since it bundles the .NET desktop runtime and WebView2 loader).
Needs nothing installed on the target machine besides the WebView2 runtime.

A much smaller framework-dependent alternative (roughly 3 MB, but requires the
**.NET 10 Desktop Runtime** on the target machine) is documented in
[`host/README.md`](host/README.md#framework-dependent-alternative-much-smaller).

## Releases / CI

GitHub Actions builds and ships the app:

- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and every pull
  request: data validation, lint, typecheck, tests, the frontend build, and a
  host `dotnet build` on `windows-latest`.
- **Release** (`.github/workflows/release.yml`) builds the self-contained
  single-file exe and packages two assets — a portable zip
  (`LoLDraftTool-<version>-win-x64-portable.zip`) and an Inno Setup installer
  (`LoLDraftTool-<version>-win-x64-setup.exe`).
  - Pushing a `v*` tag publishes them to a GitHub Release (auto-generated notes;
    pre-release for `v0.*` or tags containing `-`).
  - Every push to `main` refreshes a rolling **"Latest main build"** pre-release
    (tag `main-latest`) with the newest build, for testers who want the tip of
    `main`.
  - Manual (`workflow_dispatch`) runs build and upload the artifacts without
    publishing a release.

Binaries are **unsigned**, so SmartScreen shows an "unrecognized app" warning on
first launch (More info → Run anyway). See
[`docs/runbooks/release.md`](docs/runbooks/release.md) for how to cut a release,
how `main-latest` works, and where SignPath code signing would plug in.

## Testing

```powershell
pnpm test        # Vitest, runs once
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
```

## Legal

LoLDraftTool isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games, and all associated properties are
trademarks or registered trademarks of Riot Games, Inc.

Champion data and imagery are sourced from Riot Data Dragon and Community
Dragon; champion lane positions and fine-grained roles are sourced from Meraki
Analytics. No numbers from third-party stats sites (op.gg, u.gg, LoLalytics,
Mobalytics, etc.) are bundled with this project.

## Roadmap / v2 ideas

- Riot API opponent import using a user-supplied API key
- Tauri shell as a lighter alternative to the WPF+WebView2 host
- Fearless pool-depth warnings (flagging when a team's remaining pool is
  getting thin as champions become unavailable)
- Editable scoring weights from within the UI
