# LoLDraftTool – Data Source Research

*Research date: 2026-09-19. Live patch at time of writing: 16.18.1 (Data Dragon), CDragon content version `16.18.8175716`.*

## Executive summary

- **Champion master data is a solved problem.** Riot Data Dragon (ddragon) gives every champion's id/key/name/tags/`info` ratings/base stats and square icons under a stable, versioned URL scheme; Community Dragon (cdragon) adds the client's richer per-champion metadata (`playstyleInfo` 1–3 ratings for damage/durability/CC/mobility/utility, `tacticalInfo` damage/attack type, `championTagInfo` primary/secondary tags); Meraki Analytics' CDN adds the missing **positions** (`TOP/JUNGLE/MIDDLE/BOTTOM/SUPPORT`), fine-grained wiki roles (Juggernaut, Enchanter, ...), `attackType`, `adaptiveType`, `resource`, `releaseDate`, `attributeRatings`. All three are free, unauthenticated JSON and can be fetched at build time and bundled. Only ddragon assets are covered by an explicit Riot policy (Legal Jibber Jabber); cdragon/Meraki are community mirrors/derivatives with no formal license, but universally used.
- **The Kaggle dataset the user pointed to is a weak fit.** `luisfmcuriel/league-of-legends-team-compositions-dataset` is 34,678 solo-queue matches from **Sept 2020 (~patch 10.17/10.18, 150 champions)**, one-hot encoded (team1 champions × 150, team2 champions × 150, `Team1`/`Team2` result). No positions, no player info, no stats. It can be used to *derive* a crude synergy/counter matrix (pairwise co-occurrence win rates) but the meta is six years stale and the sample (~35k games, 11k+ champion pairs) is thin. It is publicly downloadable without a Kaggle account via the API URL (verified, 2 MB zip). Not recommended for v1 beyond experimentation.
- **There is no free, licensed, ready-made counter/synergy matrix.** LoLalytics, u.gg, op.gg, Mobalytics all have the data but only as web pages / undocumented internal endpoints; scraping is ToS-grey (Mobalytics explicitly prohibits it). Freely usable substitutes: (a) **Oracle's Elixir** pro-play CSVs (2014–2026, daily updated, "free of charge for analysts, commentators, and fans") – gives pro pick/ban rates, positions and pairings; (b) **jon-jc/league-counters** on GitHub – Master+ ranked snapshots (raw games/wins/bans per champion per role, matchup deltas) auto-committed every 3 h; (c) rule-based/attribute-based scoring from ddragon/cdragon/Meraki (damage mix, CC, engage/disengage, ranged vs melee, scaling) – needs no statistics at all.
- **Opponent import:** op.gg has **no export and no official public API** (the OP.GG MCP server is official but online-only and aimed at AI agents). The op.gg "Champions" tab is a plain HTML table (`#, Champion, Played (W/L/%), KDA, OP Score, ...`) with the champion name only in the `<img alt>` / hidden `<strong>`; the page is server-rendered (Next.js RSC POSTs, no `__NEXT_DATA__`). Recommended v1: a **manual/paste import** (CSV/JSON + tolerant parser for op.gg/u.gg copy-paste) plus a bookmarklet that serializes the champions table to JSON. v2: Riot API (`account-v1` → PUUID → `champion-mastery-v4` + `match-v5`) with a user-supplied personal key (20 req/s, 100 req/2 min, needs product registration).
- **Licensing:** bundling ddragon champion JSON + square icons is fine under Riot's Legal Jibber Jabber for a non-commercial project with the required disclaimer. Don't bundle op.gg/u.gg/LoLalytics/Mobalytics numbers. Oracle's Elixir data and Leaguepedia (CC BY-SA 3.0) can be used with attribution.

---

## 1. Kaggle & GitHub datasets

### 1.1 `luisfmcuriel/league-of-legends-team-compositions-dataset` (user's pointer)

URL: <https://www.kaggle.com/datasets/luisfmcuriel/league-of-legends-team-compositions-dataset>

Verified by downloading the archive (no account needed – see 1.1.4) and inspecting it.

| Property | Value |
|---|---|
| Last updated | 2020-09-03 ("updated 6 years ago"); "Expected update frequency: Monthly" – never happened |
| Size | 125,907,181 bytes uncompressed (3 files), ~2 MB zipped |
| License | "Database: Open Database, Contents: Database Contents" (ODbL / DbCL) |
| Usability | 9.12 |
| Downloads | ~330 total |
| Patch | Not stated; author says "150 available champions (so far 03/09/2020)". Yone and Lillia are present, Samira (10.19) is not → patch **10.16–10.18**, Season 10 solo queue |
| How made | Author: "It took me some time to write the script for getting all this data" – i.e. an unpublished Riot-API scrape. Region, queue and rank are **not stated**. Top picks (Jhin 4519, Yone 4099, Caitlyn 3762, Lux 3665, Yasuo 3434 of 34,678 games) look like normal/low-elo solo queue |

**Files**

| File | Format | Shape | Content |
|---|---|---|---|
| `Lol_matchs.csv` | CSV, 42 MB | 34,678 rows × 303 cols | col 0 = unnamed match index `0..34677`; cols 1–150 = one-hot champion picks of team 1 (alphabetical `Aatrox` … `Zyra`); cols 151–300 = the same 150 names again for team 2 (**duplicate header names**); cols 301–302 = `Team1`, `Team2` (1.0/0.0, mutually exclusive). Every row has exactly 5 ones per team. Team1 won 17,466, Team2 won 17,212 |
| `Champs` | Python pickle (numpy `f8` array) | (34678, 300) | same as the champion columns |
| `Results` | Python pickle | (34678, 2) | same as `Team1`/`Team2` |

Champion columns are by **display name** (`Cho'Gath`, `Nunu & Willump`, `Dr. Mundo`, `Kai'Sa`) – mapping to ddragon `id`/`key` requires a name→key table (ddragon `champion.json` `name` field matches these).

**Usefulness**

| Need | Verdict |
|---|---|
| (a) Champion attributes | **None.** No tags, roles, stats or positions. |
| (b) Synergy / counter statistics | **Marginal.** One can compute, for each champion pair, ally co-occurrence win rate (synergy) and enemy co-occurrence win rate (counter). With 34,678 games there are ~347k ally-pair observations over 11,175 possible pairs (~31 per pair on average, heavy tail) and ~867k enemy-pair observations. Without positions, "Lux vs Jhin" mixes mid/support Lux and cannot distinguish lane matchups from cross-lane presence. The 2020 meta (no Arcane champions, pre item rework 10.23, pre durability patch 12.10) makes the numbers largely irrelevant for 2026 drafting. Usable only as a **toy / unit-test fixture** for the synergy-matrix code path. |
| (c) Comp archetypes | **Weak.** Team compositions are present (5 champions per side) so archetype clustering (e.g. k-means on attribute vectors joined from ddragon) is possible, but pro/tournament comps are not represented and there is no position data. |

Kaggle's related notebook (`Starter: League of Legends Team ...`) just loads the CSV; a Medium series by K. Roopnarine uses similar one-hot data for win prediction and reports accuracies barely above 50 %, which is consistent with what draft-only data can do without positions/players.

#### 1.1.4 Download without an account

Since 2024-04-08 Kaggle allows anonymous download of **public** datasets via the API ([announcement](https://kaggle.com/product-announcements/485439), [CLI docs](https://github.com/Kaggle/kaggle-cli/blob/main/docs/datasets.md)). Verified with curl (HTTP 200, `application/zip`, 1,989,229 bytes):

```
curl -L -o teamcomp.zip \
  https://www.kaggle.com/api/v1/datasets/download/luisfmcuriel/league-of-legends-team-compositions-dataset
# metadata (JSON, also anonymous):
curl https://www.kaggle.com/api/v1/datasets/view/luisfmcuriel/league-of-legends-team-compositions-dataset
```

`kaggle datasets download -d luisfmcuriel/league-of-legends-team-compositions-dataset --unzip` also works; the CLI no longer requires `kaggle.json` for public datasets. No mirror is needed. The HTML page itself is JS-rendered and cannot be fetched headlessly, but the `/api/v1/datasets/view/...` endpoint returns title, description, license, size, `lastUpdated` as JSON.

### 1.2 Other Kaggle datasets

| Dataset | What it is | Usefulness |
|---|---|---|
| **`laurenainsleyhaines/25-09-league-of-legends-champion-data-2025`** (and sibling snapshots 25.S1.1, 25.S1.3, 25.S1.4, 25.05; <https://www.kaggle.com/datasets/laurenainsleyhaines/25-09-league-of-legends-champion-data-2025>) | Single CSV `050525_LoL_champion_data.csv` (172 rows, 168 KB), **CC0**, scraped from the LoL Wiki `Module:ChampionData` on 2025-05-05 (patch 25.09). Columns: `id, apiname, title, difficulty, herotype, alttype, resource, stats (dict), rangetype, date, patch, changes, role, client_positions, external_positions, damage, toughness, control, mobility, utility, style, adaptivetype, be, rp, skill_i, skill_q, skill_w, skill_e, skill_r, skills, fullname, nickname`. Example: `Aatrox … herotype=Fighter, alttype=Tank, role={'Juggernaut'}, client_positions={'Top'}, external_positions={'Top'}, damage=3,toughness=3,control=2,mobility=2,utility=2, style=20, adaptivetype=Physical` | Good **schema reference** for what a bundled champion record should contain (it is essentially Meraki's data in CSV). Stale by 1.5 years; prefer fetching Meraki/cdragon live at build time. Confirms that the LoL Wiki distinguishes `client_positions` (Riot client) from `external_positions` (wiki editors' meta view). |
| `vincentbarletta/league-of-legends-worlds-champion-pb-dataset` | Worlds pick/ban rates per champion per year, derived from Oracle's Elixir; 126 KB, last update 2021-12, license unknown | Historical only; go to Oracle's Elixir directly. |
| `jakubkrasuski/league-of-legends-ranked-match-data-season-15` | Season 15 (2025) ranked participant-level rows incl. champion, position, mastery, stats | Could derive per-position champion win rates and lane matchups for 2025; not fearless/pro. Check license on page before bundling. |
| `chuckephron/leagueoflegends` | Pro matches 2015–2018 incl. picks/bans (classic) | Outdated. |

### 1.3 GitHub / other public datasets

| Source | Content | Notes |
|---|---|---|
| **Oracle's Elixir** – <https://oracleselixir.com/tools/downloads> (mirror <https://lol.timsevenhuysen.com/matchdata/>) | Yearly CSV `YYYY_LoL_esports_match_data_from_OraclesElixir.csv`, 2014–2026, **~165 columns, 12 rows per game (10 players + 2 teams)**, current year updated **daily** (Google-Drive-hosted). Columns include `gameid, league, year, split, playoffs, date, game, patch, participantid, side, position (top/jng/mid/bot/sup/team), playername, playerid, teamname, champion, ban1..ban5, gamelength, result, kills…` plus ~120 performance columns. Data dictionary provided. | The **best free source for pro-play drafts**: pick/ban rates per patch, per position, per player champion pools, side (blue/red), ban order (ban1–5 per team). Terms: "provided free of charge, and is intended for use by analysts, commentators, and fans"; standard Riot non-endorsement disclaimer. Attribution expected. ~40–80 MB per year. Pick order within a game is **not** included (Leaguepedia has it). |
| **jon-jc/league-counters** – <https://github.com/jon-jc/league-counters> | Next.js site + `data/snapshots/` JSON committed by a GitHub Action **every 3 hours**: Master+ ranked matches from Riot API per region, stored as **raw counts (games, wins, bans) per champion per role and per matchup**; rates computed with shrinkage to 50 %, tier = `0.72·z(winrate)+0.28·z(presence)`, counters as delta vs baseline | Closest thing to a free, current, machine-readable counter dataset. No LICENSE file seen – ask the author before redistribution; usable as inspiration for the scoring formula regardless. |
| **meraki-analytics/lolstaticdata** – <https://github.com/meraki-analytics/lolstaticdata> (MIT) | Generator behind `cdn.merakianalytics.com` (see §3) | – |
| **meraki-analytics/role-identification**, **Canisback/roleML** | Algorithms + training data to infer positions from match data (playrate-based ≈95 %) | Only needed if v2 ingests raw `match-v5` timelines. |
| **LoLalytics scrapers** – `MateuszCzz/LoLalytics-Scraper-Counters-Finder`, `SJAhn-dev/LoLalytics-Helper` (stores counter+synergy JSON per lane in `data/`), `lolalytics-api` (PyPI), `Kyagara/lolalytics-scraper` | Hit LoLalytics' undocumented frontend endpoint (`ax.lolalytics.com`); several ship their scraped JSON in-repo | Data is LoLalytics' property; endpoint changes without notice. Do not bundle. |
| **Leaguepedia** (lol.fandom.com Cargo API, CC BY-SA 3.0) | Tables `ScoreboardGames` (Team1Picks/Bans, Team2Picks/Bans, patch, winner), `ScoreboardPlayers` (player, champion, role, KDA…), `PicksAndBansS7` (full **pick/ban order**), `Players`, `Tournaments` | The only source with exact pick order. `api.php?action=cargoquery&tables=ScoreboardGames&fields=...&where=...&format=json`. Anonymous rate limit is harsh (~1 query / 30–40 s, 500 rows/page); a bot account is needed for bulk. `mrtolkien/leaguepedia_parser` is archived (2023-11). Alternative libs: `pacexy/poro`. |
| **gol.gg (Games of Legends)** | Pro player pages with champion pools, win rates per champion | Web only, no API/export. |

---

## 2. Riot Data Dragon and Community Dragon

### 2.1 Data Dragon (ddragon) – official static data + assets

Docs: <https://developer.riotgames.com/docs/lol> (section "Data Dragon"). Riot: "Updating Data Dragon after each League of Legends patch is a manual process, so it is not always updated immediately after a patch" (usually within 1–2 days).

| Purpose | URL | Notes |
|---|---|---|
| Versions | `https://ddragon.leagueoflegends.com/api/versions.json` | Array, newest first: `["16.18.1","16.17.1","16.16.1","16.15.1","16.14.1", …]` |
| Realm/region version | `https://ddragon.leagueoflegends.com/realms/euw.json` | `{"n":{"champion":"16.18.1",…},"v":"16.18.1","l":"en_GB","cdn":"https://ddragon.leagueoflegends.com/cdn",…}` |
| Languages | `https://ddragon.leagueoflegends.com/cdn/languages.json` | `en_US`, `de_DE`, … (`de_DE/champion.json` verified, 160 KB) |
| Champion list | `https://ddragon.leagueoflegends.com/cdn/16.18.1/data/en_US/champion.json` | 159 KB, **173 champions** (16.18.1; includes Locke and Zaahen which Meraki lacks yet) |
| Champion full | `https://ddragon.leagueoflegends.com/cdn/16.18.1/data/en_US/championFull.json` | 2.2 MB, adds spells/passive text, skins, lore, tips |
| Single champion | `https://ddragon.leagueoflegends.com/cdn/16.18.1/data/en_US/champion/Aatrox.json` | |
| Square icon | `https://ddragon.leagueoflegends.com/cdn/16.18.1/img/champion/Aatrox.png` | 120×120 PNG, ~25 KB → 173 icons ≈ 4–5 MB bundled |
| Tile / loading / splash | `…/cdn/img/champion/tiles/Aatrox_0.jpg`, `…/cdn/img/champion/loading/Aatrox_0.jpg`, `…/cdn/img/champion/splash/Aatrox_0.jpg` | unversioned paths |
| Passive / spell icons | `…/cdn/16.18.1/img/passive/Aatrox_Passive.png`, `…/cdn/16.18.1/img/spell/AatroxQ.png` | file names from `championFull.json` |
| Everything | `https://ddragon.leagueoflegends.com/cdn/dragontail-16.18.1.tgz` | multi-GB tarball; not needed |

`champion.json` shape (`{"type":"champion","format":"standAloneComplex","version":"16.18.1","data":{ "<id>": {...} }}`):

```json
"Aatrox": {
  "version": "16.18.1", "id": "Aatrox", "key": "266", "name": "Aatrox", "title": "the Darkin Blade",
  "blurb": "Once honored defenders of Shurima…",
  "info": { "attack": 8, "defense": 4, "magic": 3, "difficulty": 4 },
  "image": { "full": "Aatrox.png", "sprite": "champion0.png", "group": "champion", "x": 0, "y": 0, "w": 48, "h": 48 },
  "tags": ["Fighter"],
  "partype": "Blood Well",
  "stats": { "hp": 650, "hpperlevel": 114, "mp": 0, "mpperlevel": 0, "movespeed": 345, "armor": 38,
             "armorperlevel": 4.8, "spellblock": 32, "spellblockperlevel": 2.05, "attackrange": 175,
             "hpregen": 3, "hpregenperlevel": 0.5, "mpregen": 0, "mpregenperlevel": 0, "crit": 0,
             "critperlevel": 0, "attackdamage": 60, "attackdamageperlevel": 0, "attackspeedperlevel": 2.5,
             "attackspeed": 0.651 }
}
```

Caveats: `key` is the numeric champion id **as a string**; `id` is the alias (`MonkeyKing` for Wukong, `Nunu` for Nunu & Willump). `tags` is only the six coarse classes (Fighter 60, Mage 75, Assassin 46, Tank 46, Support 43, Marksman 33; 1–2 per champion). **No positions.** `info` values (0–10) are the old client "attack/defense/magic/difficulty" bars.

### 2.2 Community Dragon (cdragon) – client data, updated within hours of a patch

Base: `https://raw.communitydragon.org/latest/` (or `/16.18/`, `/pbe/`). Docs: <https://github.com/CommunityDragon/Docs/blob/master/assets.md>, <https://www.communitydragon.org/documentation/assets>. Path rule: client path `/lol-game-data/assets/<Path>` → `plugins/rcp-be-lol-game-data/global/default/<path lower-cased>`. Version: `https://raw.communitydragon.org/latest/content-metadata.json` → `{"version": "16.18.8175716+branch.releases-16-18.content.release"}`.

| Purpose | URL |
|---|---|
| Champion summary | `…/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json` (55 KB; 241 entries incl. `id:-1 None` and ~68 `Jade_*` event variants – **filter `id > 0` and alias without `Jade_`**; 173 real champions) |
| Per-champion | `…/plugins/rcp-be-lol-game-data/global/default/v1/champions/266.json` |
| Square icon | `…/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/266.png` (by numeric id; ~25 KB) |
| Localized | replace `default` with `de_de`, etc. |

`champion-summary.json` entry:

```json
{ "id": 1, "name": "Annie", "description": "the Dark Child", "alias": "Annie",
  "contentId": "0b95894e-0df2-470e-b282-6c5f5cf41955",
  "squarePortraitPath": "/lol-game-data/assets/v1/champion-icons/1.png", "roles": ["mage", "support"] }
```

`champions/266.json` top-level keys: `id, contentId, name, alias, title, shortBio, isVisibleInClient, tacticalInfo, playstyleInfo, championTagInfo, squarePortraitPath, stingerSfxPath, chooseVoPath, banVoPath, roles, recommendedItemDefaults, skins, passive, spells`. The parts useful for drafting:

```json
"roles": ["fighter"],
"tacticalInfo": { "style": 3, "difficulty": 3, "damageType": "kPhysical", "attackType": "melee" },
"playstyleInfo": { "damage": 3, "durability": 3, "crowdControl": 2, "mobility": 2, "utility": 2 },
"championTagInfo": { "championTagPrimary": "Sustained Damage", "championTagSecondary": "Self Healing" }
```

`style` is 0–10 (0 = auto-attack reliant, 10 = ability reliant); `playstyleInfo` values are 1–3 as shown in the client's champion-select "Overview". `championTagInfo` is the newer client tag pair (e.g. "Sustained Damage / Self Healing", "Burst", "Engage", "Poke"…), a good archetype signal. Spells include `cost, cooldown, range, dynamicDescription, coefficients`. **No positions** here either – the client's recommended positions come from Riot's live playrate service, not static files (the `rcp-fe-lol-champ-select/.../champion-positions.json` guess returns 404).

### 2.3 Champion counts / consistency (16.18.1)

ddragon 173 · cdragon 173 (after filtering) · Meraki 171 (missing `Locke`, `Zaahen` – Meraki lags new releases by days to weeks). Join key: numeric id (`ddragon.key` = `cdragon.id` = `meraki.id`).

---

## 3. Positions, attributes, counters/synergies

### 3.1 Meraki Analytics CDN (positions + fine roles)

- All champions: `https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json` (**13.1 MB**, keyed by alias) – or per champion `…/champions/Aatrox.json`. Generator: <https://github.com/meraki-analytics/lolstaticdata> (MIT). Data merges LoL Wiki (abilities), ddragon and cdragon; updated by the maintainers typically within a few days of each patch (`patchLastChanged` per champion, e.g. `25.13`).
- Top-level keys per champion: `id, key, name, title, fullName, icon, resource, attackType, adaptiveType, stats, positions, roles, attributeRatings, abilities, releaseDate, releasePatch, patchLastChanged, price, lore, faction, skins`.

```json
{ "id": 103, "key": "Ahri", "name": "Ahri",
  "positions": ["MIDDLE"],
  "roles": ["ASSASSIN", "BURST", "MAGE"],
  "attackType": "RANGED", "adaptiveType": "MAGIC_DAMAGE", "resource": "MANA",
  "attributeRatings": { "damage": 3, "toughness": 1, "control": 2, "mobility": 3, "utility": 1,
                        "abilityReliance": 100, "difficulty": 2 },
  "releaseDate": "2011-12-14", "releasePatch": "1.0.0.131", "patchLastChanged": "25.13",
  "price": { "blueEssence": 1575, "rp": 790, "saleRp": 0 }, "faction": "ionia" }
```

Coverage (171 champions): positions TOP 59, MIDDLE 55, JUNGLE 49, SUPPORT 48, BOTTOM 29 (multi-position champions are listed under each; **every champion has ≥1 position**). Roles vocabulary (17): MAGE, FIGHTER, ASSASSIN, TANK, SUPPORT, MARKSMAN, DIVER, BURST, SKIRMISHER, JUGGERNAUT, VANGUARD, SPECIALIST, ENCHANTER, BATTLEMAGE, CATCHER, ARTILLERY, WARDEN. Resources: MANA 143, ENERGY 6, NONE 5, FURY 3, … `abilities.P/Q/W/E/R[]` contain structured `effects, cost, cooldown, targeting, damageType, castTime, targetRange, …` (for v1 only `damageType`/`targeting` are interesting, e.g. counting hard-CC abilities).

Positions in Meraki come from the LoL Wiki's `client_positions`/`external_positions` (Wiki editors, roughly = Riot client + meta). For an offline tool this is the right "authoritative default"; optionally overlay Oracle's Elixir pro pick positions for pro-oriented users.

**Build-time plan:** fetch ddragon `champion.json` + cdragon `champions/{id}.json` + Meraki `champions.json`, join on numeric id, emit one compact `champions.json` (≈150–300 KB) with `id, alias, name, tags, positions, roles, attackType, adaptiveType, resource, playstyleInfo, championTagInfo, difficulty, releaseDate` plus the icon files. Fall back to previous bundle for champions missing in Meraki.

### 3.2 Counter / synergy statistics

| Site | Free JSON/CSV? | Terms |
|---|---|---|
| **LoLalytics** (lolalytics.com) | No public API; frontend uses `ax.lolalytics.com` (undocumented, changes silently). Community wrappers exist (see §1.3). Pages show per-champion "counters"/"synergies" with win-rate deltas per lane and rank | No published ToS page found (`/terms/` 404); data is theirs. Scraping for a distributed bundle is not advisable. |
| **u.gg** | No public API (internal GraphQL-like endpoints) | ToS page blocked (403) to fetchers; treat as prohibited. |
| **op.gg** | No public REST API. Official **OP.GG MCP server** (<https://github.com/opgginc/opgg-mcp>, MIT, endpoint `https://mcp-api.op.gg/mcp`, Streamable HTTP, no auth documented) exposes tools incl. champion analysis (win/pick/ban, counters, synergies, positions) and `lol-summoner-search`, `lol-summoner-game-history`, `lol-summoner-renewal` | Online-only, aimed at LLM agents; underlying data remains op.gg's. Useful for an **optional online "refresh" feature** or a build-time snapshot for personal use, not for redistribution. |
| **Mobalytics** | No | ToS explicitly prohibits copying, data mining and scraping (<https://mobalytics.gg/terms/>). |
| **League of Graphs** | No; third-party paid wrappers (parse.bot) only | Web only. |
| **jon-jc/league-counters** | Yes – raw JSON snapshots in repo, Riot-API-derived | License unclear; ask. |
| **Oracle's Elixir** | Yes – CSV | Free with attribution; pro play only. |

Practical conclusion: for a **redistributable offline v1**, compute synergy/counter *heuristically* from bundled attributes (damage type mix, CC count, engage/poke/protect tags, ranged vs melee lane matchups, scaling) and from **pro-play co-occurrence in Oracle's Elixir** (ally pairs & enemy lane pairs with win rate + game counts, shrunk toward 50 %). Offer an *optional*, user-triggered online refresh (Riot API or OP.GG MCP) that caches locally on the user's machine – that keeps third-party data out of the distributed package.

---

## 4. Opponent import

### 4.1 op.gg

- Profile URL: `https://op.gg/lol/summoners/{region}/{GameName}-{TagLine}` (e.g. `…/kr/Hide%20on%20bush-KR1`), champion stats tab: `…/champions`. Region slugs: `na, euw, eune, kr, jp, br, las, lan, oce, ru, tr, sg, tw, vn, me`.
- **No export function and no official public API.** The page is Next.js with React Server Components: the initial GET returns fully server-rendered HTML, and interactions are `POST` requests to the same URL (RSC payload). There is **no `__NEXT_DATA__`** JSON blob anymore (verified 2026-09-19). Historically the SPA called `https://lol-web-api.op.gg/api/v1.0/internal/bypass/summoners/{region}/{summoner_id}/most-champions/rank?game_type=SOLORANKED&season_id=…`; unofficial libraries (`ShoobyDoo/OPGG.py` on PyPI as `opgg.py`, GPL-3; `miasmos/op.gg-api`; `alfawal/LoA`; `opgg-scraper` on npm) wrap that internal API and break whenever op.gg changes it.
- The **Champions tab table** (verified structure): filters = queue (`Ranked Solo/Duo, Ranked Flex, Normal, ARAM, Arena, Classic`) and season (`Season 2026 … Season 1`). Columns: `#, Champion, Played, KDA, OP Score, Laning, DMG, Wards, CS, Gold, Double kill, Triple kill, Quadra kill, Penta kill`. Row 0 is the total (`395W 320L 55%`), rows 1..n one champion each (`32W 23L 58%`, `3.13:1`). Expanding a row shows per-matchup lines (`vs Ahri 3W 6L 33% …`). **The champion name is not in the copyable text** – it lives in `<img alt="Aurora" src="https://opgg-static.akamaized.net/meta/images/lol/16.18.1/champion/Aurora.png…">` and a `<strong class="hidden … min-[480px]:block">Aurora</strong>` that is visible ≥480 px, so a plain Ctrl-A/Ctrl-C from a desktop-width window **does** include the name (`1 Aurora 32W 23L 58% 3.13:1 …`), but a mobile-width copy does not.
- op.gg Terms of Use page could not be fetched (404 at `/policies/terms`); assume automated bulk access is disallowed like at peers. Manual, user-initiated copy of a public profile the user is looking at is the safe path.

### 4.2 Riot Games API (needs a key)

- Flow: `GET https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` → `puuid` → `GET https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` (all champions, sorted by points; fields `championId, championLevel, championPoints, lastPlayTime, championPointsSinceLastLevel, …`; also `/top?count=N`) → `GET https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&start=0&count=100` → `GET …/lol/match/v5/matches/{matchId}` (participants: `championId, teamPosition (TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY), win, kills/deaths/assists`, plus `info.teams[].bans`). `league-v4/entries/by-puuid` gives rank.
- Keys: development key expires every 24 h; **personal** and development keys are limited to **20 requests / 1 s and 100 requests / 2 min**; a production key (500/10 s, 30 000/10 min) requires an approved, registered product with a working prototype (<https://developer.riotgames.com/docs/portal>, <https://developer.riotgames.com/policies/general>). Policy: "All products must be registered in, and audited by Riot Games"; never ship a key inside a distributed binary – the **user supplies their own key** in settings. 5 opponents × (1 account + 1 mastery + 1 id list + 20 match details) ≈ 115 calls ≈ 2.5 min at personal-key limits – acceptable for a manual "refresh opponents" action.
- Riot's policy discourages products that "solve our games or make everything too simple" and forbids anything giving an "unfair advantage"; draft assistants for organized team play (à la Blitz, Porofessor, Mobalytics draft tools) are an established, accepted category.

### 4.3 Third parties for pro players

- **Oracle's Elixir CSV** – filter `playername`/`playerid` to get each pro's champion pool by year/split (games, wins). Best for scrim/tournament opponents who are known pros.
- **Leaguepedia Cargo** – `ScoreboardPlayers` per player/champion incl. tournament and role; CC BY-SA, slow anonymously.
- **gol.gg**, **League of Graphs**, **u.gg** – web only.

### 4.4 Recommendation

**v1 – offline, no keys:**

1. `opponents.json` per opponent team, hand-maintained or imported:
   ```json
   { "team": "Enemy Org", "players": [
       { "name": "Player#TAG", "region": "euw", "position": "MIDDLE",
         "champions": [ { "champion": "Aurora", "games": 55, "wins": 32, "kda": 3.13, "source": "op.gg 2026-09-19 solo" } ] } ] }
   ```
2. **Paste importer**: a text box that accepts (a) a CSV `champion,games,wins[,kda]`, (b) the raw copy-paste of the op.gg Champions tab (regex per line: `^(\d+)\s+(.+?)\s+(\d+)W\s+(\d+)L\s+(\d+)%\s+([\d.]+):1` — ignore the totals row, resolve champion names through the bundled name/alias table incl. `Nunu & Willump`, `Wukong`, localized names), (c) the same for u.gg / League of Graphs when convenient. Show a preview table before committing.
3. Optional **bookmarklet** (`javascript:` that walks the table rows, reads `img[alt]` + cell texts and copies JSON to the clipboard) – zero scraping infrastructure, user-initiated, survives op.gg layout tweaks better than a fixed parser because it's editable.

**v2 – with user-supplied Riot API key:** account-v1 → champion-mastery-v4 (+ match-v5 last N ranked games per player for recency, position and win rate). Cache per PUUID locally; respect 20/1 s + 100/2 min with a simple token bucket. Optionally also pull Oracle's Elixir CSV for pro opponents.

---

## 5. Fearless draft / tournament rulesets

- Fearless Draft (champions picked by either team in an earlier game of a Bo3/Bo5 are unavailable to **both** teams for the rest of the series; normal bans still apply on top) has been the global tier-1 standard since 2025 and continues through 2026 in LCK, LPL, LEC, LTA, LCP, First Stand, MSI and Worlds (Bo3/Bo5 only; Swiss Bo1s use normal draft). "Soft fearless" (only your own team's previous picks are locked) is used in some amateur/ERL settings. A Bo5 going the distance removes 40 champions by game 5. Sources: [esports.gg explainer](https://esports.gg/news/league-of-legends/fearless-draft-in-lol-esports-explained/), [loltheory](https://blog.loltheory.gg/what-is-fearless-draft/), [thespike.gg](https://www.thespike.gg/league-of-legends/beginner-guides/fearless-draft-guide).
- 2026 addition unrelated to fearless: "First Selection" – higher seed chooses side **or** draft priority.
- Standard tournament draft order (unchanged since S7): Ban phase 1 B1 R1 B2 R2 B3 R3; Pick phase 1 B1, R1 R2, B2 B3, R3; Ban phase 2 R4 B4 R5 B5; Pick phase 2 R4, B4 B5, R5. No external data needed – encode as a small ruleset table (`normal`, `fearless-hard`, `fearless-soft`, series length). Oracle's Elixir rows for 2025+ let you validate fearless behaviour against real series if desired.

---

## 6. Licensing summary

| Item | Can bundle? | Basis / conditions |
|---|---|---|
| ddragon `champion.json`, `championFull.json`, champion square icons (+ spell/passive icons) | **Yes** (non-commercial) | Riot **Legal Jibber Jabber** (<https://www.riotgames.com/en/legal>): personal, non-exclusive, revocable licence for non-commercial fan projects; must include verbatim: *"[LoLDraftTool] was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project."* No Riot logos/trademarks in name or icon; no monetisation without a Riot API production agreement; policy explicitly bars Apple App Store / Google Play distribution (a Windows desktop download is fine). Developer policies also list Data Dragon as an approved asset source. |
| Community Dragon JSON/icons | Yes, in practice | Same Riot IP, extracted from the game client; CDragon itself publishes no licence and is tolerated by Riot (used by Riot's own dev-rel docs). Same disclaimer applies. |
| Meraki `champions.json` (positions, roles, ratings) | Yes | Generator MIT; content is Riot data + LoL Wiki text (wiki text is CC BY-SA 3.0 → keep only structured fields, not lore/ability prose, or attribute the wiki). |
| Kaggle `laurenainsleyhaines` CSV | Yes | CC0. |
| Kaggle `luisfmcuriel` team comps | Yes with attribution | ODbL/DbCL; derived matrices must credit the source; keep the licence text. Practically not worth shipping. |
| Oracle's Elixir CSV / derived pick-ban tables | Yes with attribution | "free of charge … for analysts, commentators, and fans"; credit "Oracle's Elixir / Tim Sevenhuysen"; don't resell. |
| Leaguepedia data | Yes with attribution + share-alike | CC BY-SA 3.0. |
| op.gg / u.gg / LoLalytics / Mobalytics statistics | **No** | Proprietary; Mobalytics ToS forbids scraping; others undocumented internal APIs. Only user-initiated, local, per-session use (paste import, optional online refresh). |
| Riot API responses (mastery, matches) | Only per-user, at runtime | Requires the user's own key; product registration required for distribution of a key-using feature; never embed a key. |
| jon-jc/league-counters snapshots | Ask | No licence file found. |

---

## Recommended for v1

1. **Build-time `fetch-data` script** (run by the developer per patch, output committed/bundled):
   - `versions.json` → latest `V`.
   - `ddragon/cdn/V/data/en_US/champion.json` (+ `de_DE` for localized names if wanted).
   - cdragon `champion-summary.json` (filter `id>0`, drop `Jade_*`) + `champions/{id}.json` for `playstyleInfo`, `tacticalInfo`, `championTagInfo`.
   - Meraki `champions.json` for `positions`, `roles`, `attackType`, `adaptiveType`, `resource`, `releaseDate`, `attributeRatings`; fall back to previous bundle for champions Meraki hasn't published yet.
   - Icons: `ddragon/cdn/V/img/champion/{alias}.png` (≈4.5 MB for 173).
   - Emit `data/champions.json` (one merged record per champion, keyed by numeric id) + `data/meta.json` (`{ "patch": "16.18.1", "fetchedAt": … }`).
2. **Recommendation engine inputs**: attribute heuristics from the bundle (damage mix, CC, engage/poke tags, ranged/melee, difficulty) + a **pro-play prior** built at build time from the current-year Oracle's Elixir CSV (per champion per position: pick rate, ban rate, win rate, blue/red presence; per ally pair and per lane-opponent pair: games and wins, shrunk toward 50 %). Ship the aggregated tables, not the raw CSV.
3. **Opponent data**: `opponents.json` schema above + paste/CSV importer for op.gg's Champions tab + optional bookmarklet. No network access needed.
4. **Rulesets**: normal, hard-fearless, soft-fearless, Bo1/Bo3/Bo5, side selection – static table.
5. **Legal**: About dialog with the Legal Jibber Jabber boilerplate and Oracle's Elixir credit; no Riot trademarks in app name/icon; no bundled op.gg/u.gg/LoLalytics numbers.
6. **Defer to v2**: Riot API import with user key (account-v1 + champion-mastery-v4 + match-v5), optional online refresh of counter stats via OP.GG MCP or Riot API, Leaguepedia pick-order data for post-series analysis.

### Verified sample commands

```bash
# latest patch
curl -s https://ddragon.leagueoflegends.com/api/versions.json | head -c 40
# champion master data (173 champions, 159 KB)
curl -sO https://ddragon.leagueoflegends.com/cdn/16.18.1/data/en_US/champion.json
# client metadata for Aatrox (playstyleInfo, tacticalInfo, championTagInfo)
curl -s https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/266.json
# positions/roles for all champions (13 MB, heavy - cache it)
curl -sO https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json
# square icon
curl -sO https://ddragon.leagueoflegends.com/cdn/16.18.1/img/champion/Aatrox.png
# Kaggle dataset (anonymous download works)
curl -L -o teamcomp.zip https://www.kaggle.com/api/v1/datasets/download/luisfmcuriel/league-of-legends-team-compositions-dataset
```

## Source index

- Kaggle dataset: https://www.kaggle.com/datasets/luisfmcuriel/league-of-legends-team-compositions-dataset ; API metadata https://www.kaggle.com/api/v1/datasets/view/luisfmcuriel/league-of-legends-team-compositions-dataset ; anonymous download announcement https://kaggle.com/product-announcements/485439 ; CLI docs https://github.com/Kaggle/kaggle-cli/blob/main/docs/datasets.md
- Wiki-scraped champion CSV: https://www.kaggle.com/datasets/laurenainsleyhaines/25-09-league-of-legends-champion-data-2025
- Worlds P/B: https://www.kaggle.com/datasets/vincentbarletta/league-of-legends-worlds-champion-pb-dataset ; Season 15 ranked: https://www.kaggle.com/datasets/jakubkrasuski/league-of-legends-ranked-match-data-season-15
- Data Dragon docs: https://developer.riotgames.com/docs/lol ; versions https://ddragon.leagueoflegends.com/api/versions.json
- Community Dragon: https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/ ; docs https://github.com/CommunityDragon/Docs/blob/master/assets.md ; https://www.communitydragon.org/documentation/assets
- Meraki: https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json ; https://github.com/meraki-analytics/lolstaticdata ; role identification https://riot-api-libraries.readthedocs.io/en/latest/roleid.html
- Oracle's Elixir: https://oracleselixir.com/tools/downloads ; https://lol.timsevenhuysen.com/matchdata/ ; example consumer https://github.com/SahilAshar/lol-meta-tracker
- Leaguepedia: https://lol.fandom.com/wiki/Leaguepedia:Dev_Blog/2022 ; https://lol.fandom.com/wiki/Module:CargoDeclare/ScoreboardGames ; https://github.com/mrtolkien/leaguepedia_parser ; https://hextechdocs.dev/gathering-lolesports-data/
- Counter datasets/scrapers: https://github.com/jon-jc/league-counters ; https://github.com/SJAhn-dev/LoLalytics-Helper ; https://github.com/MateuszCzz/LoLalytics-Scraper-Counters-Finder ; https://libraries.io/pypi/lolalytics-api
- op.gg: https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1/champions (structure verified) ; https://github.com/opgginc/opgg-mcp ; https://pypi.org/project/opgg.py/ ; https://github.com/miasmos/op.gg-api ; https://github.com/alfawal/LoA
- Riot API: https://developer.riotgames.com/apis ; https://developer.riotgames.com/docs/portal ; https://developer.riotgames.com/policies/general ; champion-mastery-v4 reference https://riot-watcher.readthedocs.io/en/latest/riotwatcher/LeagueOfLegends/ChampionMasteryApiV4.html
- Legal: https://www.riotgames.com/en/legal ; https://mobalytics.gg/terms/
- Fearless: https://esports.gg/news/league-of-legends/fearless-draft-in-lol-esports-explained/ ; https://blog.loltheory.gg/what-is-fearless-draft/ ; https://www.thespike.gg/league-of-legends/beginner-guides/fearless-draft-guide
