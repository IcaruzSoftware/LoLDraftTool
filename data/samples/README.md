# Import samples

Example inputs for the importers in `app/src/import/`. Used by the import unit
tests and as reference for the accepted formats.

## Team pool

- **`team-pool.json`** — the user's nested per-role format. Role keys are
  tolerant (`Toplane`, `Jungle`, `Midlane`, `ADC`, `Support`), each with
  `comfort` / `good` / `okay` champion lists and an optional `player`. Champion
  names are fuzzy-resolved (`"Kaisa"` -> Kai'Sa, `"MF"` -> Miss Fortune).
- **`team-pool.csv`** — the flat `role,tier,champion,player` equivalent. Header
  is case-insensitive; `;` and `,` delimiters, quoting, BOM and CRLF are all
  accepted.

Parsed by `parseTeamPool(text, resolver)` into a `TeamPool`
(`Record<Position, { comfort; good; okay; player? }>`).

## Opponents

- **`opponents.json`** — `{ players: [{ name, role?, champions: [{ name |
  championId, games, wins }] }] }`. A `winrate` (0-1 fraction or 0-100 percent)
  with `games` is accepted in place of `wins`.
- **`opponents.csv`** — `player,role,champion,games,wins` (a `winrate` column is
  also accepted). Rows are grouped by player.
- **`opgg-paste.txt`** — a plausible copy-paste of the op.gg "Champions" tab.
  The leading totals row is ignored; each champion row yields `games = W + L`,
  `wins = W`. The player name and role are supplied separately (op.gg does not
  include them in the table).

Parsed by `parseOpponents(text, resolver, options?)` (auto-detects JSON / CSV /
op.gg paste) and `parseOpggPaste(text, resolver, playerName?, role?)`.
