# LoLDraftTool – Domain Research

Discovery research for a rule-based (no AI/LLM) pick/ban assistant for a League of Legends team.
Written 2026-09-19. All facts below are sourced from the linked pages; where sources disagree or the client behaviour has changed recently, both values are given.

## Executive summary

- **Two draft formats matter.** *Tournament Draft* (Clash, pro, most amateur leagues) is fully sequential and fully visible: bans 3-3 alternating (blue first), picks B1 / R1 R2 / B2 B3 / R3, bans 2-2 alternating (red first), picks R4 / B4 B5 / R5, then a swap/finalization window. *Ranked Draft Pick* has a declare-intent phase, one **simultaneous, hidden** ban window (every player bans one champion; cross-team duplicates allowed, so 8–10 unique bans), a reveal, then picks 1-2-2-2-2-1 alternating starting with blue. The tool must model both, but Tournament Draft is the primary target because a team acts as a unit and the second ban phase is where "react to what they showed" happens.
- **Fearless Draft** (tier-1 pro since 2025, standard is "full fearless": a champion picked by either team is dead for the rest of the series) and the 2026 **First Selection** rule (winner picks *either* side *or* first pick) are series-level meta-rules. Fearless only requires the tool to carry a per-series "unavailable" set.
- **Team-comp archetypes** are well codified in coaching literature: Teamfight/Wombo (engage), Front-to-back / Protect-the-carry, Poke/Siege, Pick/Catch, Dive, Split push (1-3-1 / 1-4), Counter-engage/Disengage, plus the time axis Early-snowball vs Late-scaling, and the niche Global/roam comp. Each has a small set of *defining traits* (which the engine can score from per-champion tags) and a small set of *counter-archetypes*. A rock-paper-scissors table exists and is reasonably consistent across sources (e.g. Engage beats Poke, Poke/Siege beats Protect, Protect beats Engage/Dive, Pick beats Split, Teamfight beats Pick).
- **Comp hygiene checks** every source repeats: AD/AP balance (at least two real damage sources of each type or a clear reason not to), at least one frontline, at least one reliable engage OR reliable disengage, enough hard CC, waveclear, a single coherent win condition, and a sane power curve vs the enemy's.
- **Counterpick value is role-dependent.** Top has the highest counterpick value (isolated 1v1 lane), mid medium (roams dilute it; AD/AP and mobility matter more), jungle/ADC/support low (map-interactive). Hence pros pick support, jungle and ADC (and flex picks) early, and save the last picks (R3, B5, R5) for top/mid counterpicks. Blind-pick safety = few hard counters + self-sufficient lane + escape/range + flex value.
- **Flex picks** (Gragas, Sett, Pantheon, Galio, Karma, Senna, Sylas, Irelia, Ornn …) are first-pick material because the opponent cannot counterpick a champion whose lane is unknown.
- **Bans** fall into four buckets: target bans (opponent player's comfort/OTP), meta/OP bans, protect bans (remove hard counters or hard engage vs your planned/locked picks), and phase-2 "cut the remaining roles" bans (ban what would complete the enemy's already-visible comp; ban counters to what you've shown).
- **Data**: Riot Data Dragon gives coarse `tags` (Fighter/Tank/Mage/Assassin/Support/Marksman) and `info` ratings; Community Dragon's `champions/{id}.json` additionally gives `roles`, `championTagPrimary/Secondary` (e.g. "Dive", "Battlecaster", "Ally Protection", "Burst", "Duelist", "Crowd Control"), `tacticalInfo.damageType` (kPhysical/kMagic/kMixed), `attackType` (melee/ranged) and `playstyleInfo` 1–3 ratings (damage, durability, crowdControl, mobility, utility). LoL Wiki subclasses (Vanguard, Warden, Juggernaut, Diver, Burst, Battlemage, Artillery, Assassin, Skirmisher, Enchanter, Catcher, Marksman, Specialist) are the best free semantic taxonomy. Together these seed ~60% of the proposed schema automatically; the remaining behavioural tags (engage, disengage, global, splitpush, anti-tank, anti-heal, waveclear, hypercarry, blind-safe …) need a curated table (~170 rows, maintainable by hand).
- **Worked example** (enemy locks Nocturne, Galio, Shen): the engine should detect `global >= 3` → archetype *Global/Pick*, whose weaknesses are grouping, vision, disengage, spell-shields and a stronger 5v5; the recommended responses are a front-to-back/protect comp with disengage + anti-dive peel (Janna/Lulu/Morgana-type), self-peeling carries, and champions that punish Nocturne's dash (Morgana E, Poppy W), plus target-banning the missing pieces (Twisted Fate, Pantheon, Ryze, Karthus) in ban phase 2.

---

## 1. Draft formats and exact chronological order

### 1.1 Tournament Draft (Clash, professional play, most amateur leagues)

Also called "Split Draft" on the LoL Wiki. Sequence confirmed by the LoL Wiki *Team drafting* page and the Mobalytics picks/bans guide:

| # | Phase | Actor | Action | Notes |
|---|-------|-------|--------|-------|
| 1 | Ban 1 | Blue | Ban 1 | |
| 2 | Ban 1 | Red | Ban 1 | |
| 3 | Ban 1 | Blue | Ban 2 | |
| 4 | Ban 1 | Red | Ban 2 | |
| 5 | Ban 1 | Blue | Ban 3 | |
| 6 | Ban 1 | Red | Ban 3 | 6 bans total |
| 7 | Pick 1 | Blue | **B1** | "first pick" |
| 8 | Pick 1 | Red | **R1** | back-to-back |
| 9 | Pick 1 | Red | **R2** | |
| 10 | Pick 1 | Blue | **B2** | back-to-back |
| 11 | Pick 1 | Blue | **B3** | |
| 12 | Pick 1 | Red | **R3** | 3 picks each |
| 13 | Ban 2 | Red | Ban 4 | **red starts ban phase 2** |
| 14 | Ban 2 | Blue | Ban 4 | |
| 15 | Ban 2 | Red | Ban 5 | |
| 16 | Ban 2 | Blue | Ban 5 | 10 bans total |
| 17 | Pick 2 | Red | **R4** | red starts pick phase 2 |
| 18 | Pick 2 | Blue | **B4** | back-to-back |
| 19 | Pick 2 | Blue | **B5** | blue's last pick |
| 20 | Pick 2 | Red | **R5** | **last pick of the draft = strongest counterpick slot** |
| 21 | Finalization | both | swaps within team | ~60 s |

Compressed notation: bans 3-3 (B R B R B R) → picks 1-2-2-1 (B, RR, BB, R) → bans 2-2 (R B R B) → picks 1-2-1 (R, BB, R). This matches the order the task asked to verify.

**Timing.** The in-client Tournament Draft (Clash) uses 30 s per ban turn and 30 s per pick turn, and a 60 s finalization phase (LoL Wiki *Team drafting*). Some league rulebooks (e.g. PlayVS) use 40 s per step. Pro broadcasts run the same client timers but referees can pause. The tool should treat the turn timer as a configurable constant (default 30 s) and not depend on it.

**Information visibility (Tournament Draft).** Every ban and every locked pick is revealed to both teams the moment it locks; there is no hidden phase. Within a team, the currently active player's hover ("intent") is shown to allies; the LoL Wiki states that in Tournament Draft ban intent is visible to both teams during the turn, whereas pick hovers are conventionally treated as team-internal (pro teams hover decoys precisely because opponents *do* see the hover on the broadcast client only after lock). For the engine this means: the opponent's information state after step *k* is exactly the set of locked bans and picks up to *k*, and **roles are not declared** – the opponent only sees champions, not lane assignments, until the game starts. That is what makes flex picks valuable (§3).

**Side asymmetry.** Blue gets the single first pick (best champion in the meta or a flex), red gets two back-to-back picks (R1+R2, a natural duo synergy such as jungle+mid or ADC+support) and the very last pick (R5, the cleanest counterpick). Red also opens ban phase 2 and pick phase 2. Blue gets B4+B5 back-to-back in phase 2, after seeing R4.

### 1.2 Fearless Draft (pro, 2025 →)

Series-level rule layered on top of Tournament Draft: a champion that has been *played* in an earlier game of the best-of series can no longer be picked in later games. Two variants:

- **Full/hard fearless** (the standard in all tier-1 leagues – LCK, LPL, LEC, LTA, LCP – MSI and Worlds 2025 and continuing into 2026): once *either* team plays a champion, *neither* team can pick it again in the series. Game 3 starts with 20 champions fearless-locked, game 4 with 30, game 5 with 40 (plus the normal 10 bans).
- **Soft fearless** (used in LCK CL / LDL trials and in some early 2025 events): a champion is only locked for the team that played it; the opponent may still pick it once.

Game 1 is an ordinary draft; the normal 10-ban phase remains unchanged in every game. For the tool: maintain a per-series `unavailable` set (optionally per team for soft fearless) that is subtracted from every recommendation, and warn when a role's pool is running thin for later games.

Sources: [OneEsports](https://www.oneesports.gg/league-of-legends/what-is-fearless-draft/), [LoLTheory](https://blog.loltheory.gg/what-is-fearless-draft/), [Wikipedia 2025 LCK season](https://en.wikipedia.org/wiki/2025_LCK_season).

### 1.3 First Selection (pro, 2026 →)

From 2026, the team that wins "selection" chooses **either** map side (blue/red) **or** draft order (first pick / last pick); the other team gets the remaining option. Side and pick order are thus decoupled. The client sequence above is unchanged, but "blue" in the table becomes "the first-pick team". The tool should model `first_pick_team` separately from `map_side` (it only affects labels).

Sources: [esports.gg](https://esports.gg/news/league-of-legends/first-selection-explained/), [GosuGamers](https://www.gosugamers.net/lol/news/77812-lol-esports-2026-introduces-new-draft-rule-first-selection-and-a-bo5-heavy-first-stand).

### 1.4 Ranked / Normal "Draft Pick" (solo/duo, flex)

Sequence (LoL Wiki *Draft Pick*, Dignitas ranked drafting guide, Riot patch 25.23):

1. **Declare Intent / "pick intent" phase** – all 10 players simultaneously hover a champion they intend to *pick*. Hover is shown to **allies only** (large portrait) so teammates avoid banning it and can coordinate. Duration 15 s (reduced to **7 s** on NA/OCE in patch 25.23, rolling out to other regions in 25.24).
2. **Ban phase** – all 10 players ban **simultaneously** in a single window; each player bans exactly one champion (5 per team, 10 total). Teammates cannot ban the same champion as each other; **both teams may ban the same champion**, so 8–10 unique champions are removed. Bans are **hidden** from the enemy until the phase ends, then revealed. Confirming a ban is required; failing to ban counts as a dodge. Duration 30 s (25 s after 25.23). Ban intent hovers are visible to allies; a teammate's *pick*-intent champion cannot be banned by that team.
3. **Pick phase** – alternating, starting with blue ("First Pick" badge): **B1 → R1 R2 → B2 B3 → R4 R5 → B4 B5 → R5** i.e. 1-2-2-2-2-1. Each pick turn is 30 s (25 s after 25.23); total pick phase 3:00 (2:30 after 25.23). Picks are revealed to the enemy the moment they lock, hovers are team-internal.
4. **Finalization** – ~30 s: within-team champion trades, runes and summoner spells. Players may also swap pick *order* with a teammate before their turn (e.g. to give a counterpick slot to the top laner).

Role assignment (Top/Jungle/Mid/Bot/Support/Fill) is chosen *before* the queue; unlike Tournament Draft, every player's role is fixed and known to their team, but **not** to the enemy. There is no second ban phase in ranked.

Older sources quote 29 s pick timers and 15 s bans; the current values above are from [LoL Wiki V25.23](https://wiki.leagueoflegends.com/en-us/V25.23) and [LoL Wiki Draft Pick](https://wiki.leagueoflegends.com/en-us/Draft_Pick). Duplicate-ban behaviour from Riot's 10-ban launch post as quoted by [forum/community summaries](https://crackersna.wordpress.com/changes-to-draft-ranked-ban-system/).

### 1.5 Information-state summary for the engine

| Format | Bans visible to enemy | Picks visible to enemy | Roles visible to enemy | Reactive phases |
|---|---|---|---|---|
| Tournament | immediately, sequential | immediately on lock | never (inferred from champion) | Ban 2 reacts to Pick 1; R3, R4/B4/B5, R5 react to everything before |
| Ranked | only after the whole ban window | immediately on lock | never | every pick after B1 is reactive; no ban reaction |

Consequence: the engine's core operation is "given (locked bans, locked picks per side, our known roles/pool, opponent's inferred roles) recommend the next action for our side", called once per turn in Tournament Draft and once per ban window / pick turn in Ranked.

---

## 2. Team composition theory

### 2.1 Archetypes

Sources broadly agree on the following list (Mobalytics team-comp guides, Leaguepedia *Team Compositions*, ChampBop, Backdash, Guild Order, LoL-Tracker). Two orthogonal axes are used: *how the team creates pressure* (Teamfight, Poke/Siege, Pick/Catch, Split push, Global) and *how a fight is executed* (Front-to-back, Protect-the-carry, Dive, Counter-engage). A real comp is usually a primary + a secondary.

| Archetype | Defining traits | Enabling champion traits/tags | Weak to / countered by |
|---|---|---|---|
| **Teamfight / Engage / "Wombo"** | At least one hard engage (Malphite R, Sejuani, Orianna+diver, Rakan, Kennen), lots of AoE CC and AoE damage, wants grouped 5v5s in chokes | `engage`, `aoe_cc`, `aoe_damage`, Vanguard, Battlemage, Diver | Disengage/counter-engage (Janna, Gragas, Anivia), poke that chips before ults are up, split push that refuses to group, cooldown-dependent (weak when R down) |
| **Front-to-back / Protect-the-carry** | 1 (or 2) scaling hypercarries + peel-heavy support/tanks + disengage; wins 5v5 by out-DPSing | `hypercarry`, `peel`, `disengage`, `shield/heal`, Enchanter, Warden, Marksman | Assassins/dive that bypass peel, poke/siege that whittles before the fight, split push (protect comps hate splitting), early snowball |
| **Poke / Siege** | Long-range skillshots (Jayce, Xerath, Ziggs, Zoe, Ezreal, Varus, Caitlyn), tower damage, disengage CC; strong early/mid, siege turrets, weak in extended fights | `poke`, `long_range`, Artillery, `siege`, `disengage`, `waveclear` | Hard engage / dive (squishy backline), tanks with sustain/shields, champions that close gaps or go under it (Malphite, Nocturne, Zac), long-scaling comps that survive |
| **Pick / Catch** | Single-target hard CC + burst + vision control (Blitzcrank, Thresh, Ashe, Morgana, Nocturne, Elise, Syndra, Lissandra); punishes over-extension | `pick_cc`, `burst`, `vision_control`, Catcher, Assassin | Grouping and playing together, spell shields/cleanse, tanky front lines, pure 5v5 teamfight comps; falls off late |
| **Dive** | Mobile gap-closers that all jump the backline at once (Renekton, Vi, J4, Nocturne, Camille, Ahri, Lucian) | `dive`, `gap_close`, `mobility`, Diver, Assassin | Peel + disengage (Protect), counter-engage, self-peeling carries (Ezreal, Vayne, Kai'Sa, Zeri), late scaling (dive falls off) |
| **Split push (1-3-1 / 1-4)** | 1–2 strong duelists with waveclear + escape or global (Fiora, Jax, Camille, Tryndamere, Yorick, Shen, TF), rest of team holds with disengage/waveclear | `splitpush`, `duelist`, `waveclear`, `global`, Skirmisher, Juggernaut | Pick comps (catch the splitter), hard engage that forces 4v5 fights before splitter arrives, strong 5v5 comps, matching duelist |
| **Counter-engage / Disengage** | Holds ground and turns enemy engage (Gragas, Janna, Anivia, Braum, Alistar, Seraphine); needs to stay grouped | `disengage`, `counter_engage`, Enchanter, Warden | Poke (get chipped before the counter-engage matters), split push (forces separation), pick comps |
| **Early-game snowball** | Lane bullies, strong early junglers, dive; wants to end < 25 min | `early_strong`, `lane_bully`, `dive` | Scaling comps that survive with safe laners, disengage, tanks |
| **Late-game scaling** | Hypercarries and infinite-scaling champs (Nasus, Kayle, Veigar, Ryze, Azir, Jinx, Kog'Maw, Vayne), wants 25+ min | `late_strong`, `hypercarry` | Early aggression, dive, pick comps, poke/siege that forces objectives early |
| **Global / Roam** | 3+ global or semi-global ults (Shen, TF, Nocturne, Pantheon, Galio, Ryze, Karthus, Taliyah) that turn 2v2s into 3v2s across the map | `global`, `semi_global`, `roam` | Vision + grouping (no isolated skirmishes to collapse on), tracking ult cooldowns and forcing when down, spell shields / stopwatch vs Nocturne/Karthus, out-scaling (these picks are individually mediocre 5v5), punishing the lane the global champ leaves |

Damage-type profile comps (Backdash's "Tank comp", "Mage comp", "AD comp", "Support comp") are better treated as *hygiene warnings* (§2.3) than as archetypes.

Rock-paper-scissors summary used by ChampBop and Guild Order (useful as a lookup table):

- Engage/Teamfight beats Poke/Siege and Pick; loses to Protect/Counter-engage and Split.
- Protect/Front-to-back beats Engage and Dive; loses to Poke/Siege and Split.
- Poke/Siege beats Protect and Split (can't siege back); loses to Engage and Dive.
- Pick beats Split and Poke (catches squishies); loses to Teamfight/Engage and Protect.
- Split beats Protect and Counter-engage; loses to Pick and Engage.
- Early snowball beats Late scaling if it converts; Late scaling wins if it survives.

Sources: [Mobalytics – Engage comp](https://mobalytics.gg/lol/guides/how-to-play-the-engage-team-comp), [Mobalytics – Counter-engage](https://mobalytics.gg/lol/guides/how-to-counter-engage-team-comp), [Mobalytics – Poke](https://mobalytics.gg/lol/guides/how-to-play-the-poke-team-comp), [Mobalytics – Dive](https://mobalytics.gg/lol/guides/how-to-dive-team-composition), [Mobalytics – 1-3-1](https://mobalytics.gg/lol/guides/how-to-play-1-3-1), [Mobalytics – Team comps & teamfighting](https://mobalytics.gg/lol/guides/everything-you-need-to-know-about-team-comps-and-teamfighting), [Leaguepedia – Team Compositions](https://lol.fandom.com/wiki/New_To_League/Meta/Team_Compositions), [ChampBop](https://champbop.com/league-of-legends/league-of-legends-team-compositions-explained/), [Backdash](https://www.thebackdash.com/league-of-legends/complete-guide-to-team-compositions-in-lol), [Guild Order](https://guildorder.com/games/league/guides/draft-and-champ-select-theory), [LoL-Tracker archetypes](https://lol-tracker.com/compositions), [Dignitas – Global ults](https://dignitas.gg/articles/a-guide-to-global-and-semi-global-ultimates-in-league-of-legends).

### 2.2 How coaching sources evaluate a comp systematically

Recurring checklist (Dignitas ranked guide, Guild Order, coachailytics, LoL-Tracker, Mobalytics):

1. **Win condition** – exactly one clear primary plan (teamfight, siege, split, pick, scale); picks that pull in different directions are a red flag.
2. **Damage profile** – AD/AP balance. LoL-Tracker: "at least two reliable sources of significant magic damage" (and symmetric for physical); a 5-AD comp lets the enemy stack armor.
3. **Frontline** – at least one durable champion (Vanguard/Warden/Juggernaut) who can start or absorb a fight.
4. **Engage** – at least one reliable way to start a fight on your terms, OR
5. **Disengage / peel** – at least one reliable way to refuse a fight (needed when the enemy has more engage than you).
6. **Crowd control** – total hard CC (knock-ups, stuns, roots, suppress) and whether it is AoE (teamfight) or single-target (pick).
7. **Waveclear** – needed to hold sieges, to enable split pushing, and to end games.
8. **Scaling curve** – early / mid / late power vs the enemy's; a comp must have a plan for the window in which it is weaker.
9. **Utility** – shields, heals, MS buffs, vision tools.
10. **Tower damage / siege ability**, anti-tank (% HP / true damage) and anti-heal when the enemy has heavy sustain.

### 2.3 Hygiene rules suitable for a rule engine

- `sum(ad_sources) >= 2 and sum(ap_sources) >= 2` else warn "damage profile lopsided".
- `count(frontline) >= 1` else warn "no frontline".
- `engage_score >= threshold or disengage_score >= threshold` else warn "no way to start or stop fights".
- `hard_cc_score >= threshold` (weighted AoE > single target for teamfight plans).
- `waveclear_score >= threshold` when plan is Split or when enemy plan is Siege.
- If enemy has `sustain_score >= x` → prefer `anti_heal` champions; if enemy has 2+ tanks → prefer `anti_tank`.
- Power-curve check: if enemy `early_score` >> ours, require `safe_lane`/`disengage` picks; if enemy `late_score` >> ours, require tempo/objective tools.

---

## 3. Counterpicking theory

### 3.1 How lane counters work, per role

- **Top lane – highest counterpick value.** The lane is long, isolated and 1v1; the matchup decides the lane. Classic axes: ranged vs melee (Vayne/Quinn/Kennen vs melee bruisers), sustain/shields vs poke, tank stats vs bruiser snowball (Malphite vs AD fighters), true/%-HP damage vs tanks (Fiora, Vayne, Gwen), lock-in CC vs mobility (Mordekaiser, Poppy vs Camille/Irelia), early bullies vs scalers (Renekton/Darius vs Kayle/Nasus). Top is the canonical last-pick slot.
- **Mid lane – medium value.** Counters exist (assassins vs immobile mages; Kassadin/Galio vs AP; ranged mages vs melee; Cassiopeia/Kassadin punishing roaming assassins) but roaming and jungle interaction dilute them. Mid is the second most common last-pick role, often chosen for AP/AD balance and mobility profile rather than raw matchup.
- **Jungle – low to moderate value.** Matchups are about clear speed, early duelling (Olaf/Lee vs farmers), invade potential and gank style vs enemy lane mobility; picked early because jungle "counter" is about team-level pressure, not lane.
- **ADC – low value.** 2v2 lane; range and safety matter more than a specific counter (Caitlyn range vs short-range ADCs, Draven/Lucian early aggression vs scalers). Chosen early alongside support to lock synergy.
- **Support – low value.** Counter relations exist (Morgana vs hook supports, Janna vs engage, Alistar/Leona vs squishy enchanters, Yasuo/Viego ADC vs hooks) but supports are picked early because they define engage/peel identity and have few hard counters.

Practical heuristic from coaching material: lock comfort ~80% of the time; a 53% win-rate comfort pick beats a 47% "counter" you don't master; only counterpick when (a) the enemy has locked, (b) you hold the last pick, (c) the counter fits the comp, (d) the lane rewards counters (top > mid > others).

Sources: [Boosting Market – counter-pick guide by lane](https://boostingmarket.com/blogs/lol-counter-pick-guide-by-lane/), [Boosting Market – draft phase guide](https://boostingmarket.com/blogs/lol-draft-phase-guide/), [Guild Order](https://guildorder.com/games/league/guides/draft-and-champ-select-theory), [Dignitas – ranked drafting](https://dignitas.gg/articles/an-in-depth-drafting-guide-for-ranked-games-league-of-legends).

### 3.2 Blind-pickable vs counter-vulnerable champions

Blind-pick safety is defined by *fewest hard counters and widest band of even matchups*, not by raw strength (Mobalytics, Dignitas). Traits: self-sufficient lane (sustain, shield, waveclear), an escape or enough range to survive a bad matchup, adaptable build (e.g. Sion/Camille shields adapt to damage type), scaling so an early deficit matters less, and ideally flex value. Examples cited: Vladimir, Orianna, Viktor, Malzahar (mid); Malphite, Sion, Camille, Ornn (top); Nautilus, Morgana, Karma (support); Ashe, Miss Fortune, Ezreal (ADC); Vi, Olaf (jungle). Counter-vulnerable champions are melee lane bullies without escapes, immobile mages, and hyper-specialised duelists (Fiora, Tryndamere, Yasuo, Irelia in a bad matchup).

For the schema: `blind_safe` 0–3 per (champion, role), curated per patch; the engine uses it to choose *which* comfort champion to expose in an early slot and *which* to hold for a counter slot.

Sources: [Mobalytics – best blind picks](https://mobalytics.gg/lol/guides/best-blind-pick-champions), [Dignitas – blind picking](https://dignitas.gg/articles/blogs/Unknown/14738/the-best-champions-for-blind-picking-in-lol), [Dignitas – top tier blind picks](https://dignitas.gg/articles/top-tier-blind-picks).

### 3.3 Flex picks and hiding information

Because the opponent sees champions but not roles, a champion viable in 2–3 roles denies the counterpick: the enemy must guess which lane to counter. Frequently cited flexes: Gragas (jng/top/sup/mid), Sett (top/sup/jng), Pantheon (top/mid/sup/jng), Galio (mid/sup), Karma (mid/sup), Senna (ADC/sup), Sylas (mid/top/jng), Irelia (top/mid), Ornn (top/sup), Swain (mid/sup/ADC), Ryze, Aurora, Poppy (top/jng/sup), Maokai (jng/sup), Taliyah (mid/jng), Seraphine (mid/sup/ADC). B1 is "the most valuable pick in the draft" and is spent on either the meta's strongest champion or a universally powerful flex. The tool should therefore compute `flex_value = number of roles in our pool where this champion is comfort/good` and prefer high-flex champions for B1/R1/R2/B2/B3.

Sources: [Dignitas – Win before you play](https://dignitas.gg/articles/blogs/League-of-Legends/14665/win-before-you-play-navigating-draft-phase-in-league-of-legends), [LoL-Tracker – tournament draft strategy](https://lol-tracker.com/blog/tournament-draft-lol-pick-and-ban-strategy-for-teams), [Guild Order](https://guildorder.com/games/league/guides/draft-and-champ-select-theory).

### 3.4 Typical role order in Tournament Draft

Consensus across Dignitas, Mobalytics, LoL-Tracker and coaching forums:

- **Phase 1 (B1–R3):** power picks and flexes; commonly jungle, support, ADC (low counterpick sensitivity, high meta sensitivity, and they define engage/peel identity). R1+R2 and B2+B3 are natural duo slots (jng+sup, ADC+sup, mid+jng).
- **Phase 2 (R4–R5):** "counterpicker phase", most often top and mid; R5 is the premium counter slot, B4/B5 gives blue two picks to answer R4 and complete the comp. Ranked mirrors this: early pick slots take comfort/blind-safe, last slots counter.
- Rule of thumb for the engine: assign each remaining role a `counterpick_sensitivity` (top 3, mid 2, jng 1, ADC 1, sup 1) and prefer to spend early slots on low-sensitivity roles or high-flex champions, late slots on high-sensitivity roles once the enemy's likely lane opponent is visible.

---

## 4. Ban theory

Four (overlapping) ban types recur across Mobalytics, coachailytics, Guild Order, Dignitas and LoL-Tracker:

1. **Target bans** – remove a specific enemy player's signature/comfort champion, especially against players with narrow pools ("force them off comfort"). Requires the opponent's champion data the tool optionally imports: recent games per player, win rate, games played. Highest value in phase 1 versus known one-tricks.
2. **Meta / OP bans** – remove patch outliers with disproportionate win/pick/ban rates regardless of opponent. The tool needs an editable per-patch "priority" list (imported or hand-maintained) – it must not be hard-coded.
3. **Protect bans** (a.k.a. comfort/synergy bans) – remove champions that would counter or hard-punish *our* intended comp or a pick we have already shown: e.g. ban assassins/hard engage if we plan a squishy protect comp; ban the hard counter to our top laner's comfort pick we intend to blind; ban the champion that completes a synergy the enemy is building (Yasuo when they have knock-ups, Yuumi/Lulu when they have a hypercarry).
4. **Phase-2 "cut the remaining roles" bans** – after 3 picks each, infer the enemy's remaining roles from their locked champions (LoL Wiki: "teams usually ban depending on what roles are left, based on the role that already-picked enemy champions are commonly started") and (a) ban the best remaining options for those roles, (b) ban the champions that would counter *our* already-shown picks in the lanes still open, (c) ban the piece that would complete an emerging enemy archetype (§6).

Ordering heuristic (Guild Order): first bans go to meta staples/OP, second to counter-meta/threats to your plan, third to matchup-specific denial. Do not "waste" a ban on a champion the opponent is unlikely to play unless the target intel is strong. In ranked, at lower skill bands ban snowball champions you cannot play around; at higher bands ban for comp; an autofilled player should default to banning the strongest jungler.

Sources: [Mobalytics picks & bans guide](https://mobalytics.gg/blog/picks-bans-guide/), [coachailytics](https://coachailytics.com/guide-to-picks-and-bans-in-league-of-legends/), [Dignitas](https://dignitas.gg/articles/blogs/League-of-Legends/14665/win-before-you-play-navigating-draft-phase-in-league-of-legends), [LoL Wiki – Team drafting](https://wiki.leagueoflegends.com/en-us/Team_drafting), [Dot Esports – Pick/Ban strategies](https://dotesports.com/league-of-legends/news/pickban-strategies-7990).

---

## 5. Champion attribute taxonomy

### 5.1 What existing data provides for free

**Riot Data Dragon** (`https://ddragon.leagueoflegends.com/cdn/<patch>/data/en_US/champion.json`, mirrored e.g. at [noxelisdev/LoL_DDragon](https://github.com/noxelisdev/LoL_DDragon/blob/master/latest/data/en_US/champion.json)): per champion `id`, `key` (numeric), `name`, `tags` (1–2 of `Fighter, Tank, Mage, Assassin, Support, Marksman`), `info` {attack, defense, magic, difficulty} 0–10, `partype` (resource), base `stats` (hp, armor, movespeed, attackrange …). `attackrange` is the cheapest reliable ranged/melee discriminator and the `tags` are coarse but stable.

**Community Dragon** (`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/{id}.json` and `champion-summary.json`; docs at [communitydragon.org](https://www.communitydragon.org/documentation/assets)): adds
- `roles`: lowercase set of the same six classes, often two (e.g. Galio `["tank","mage"]`, Nocturne `["fighter","assassin"]`, Shen `["tank"]`, Annie `["mage","support"]`).
- `championTagPrimary` / `championTagSecondary`: Riot's newer playstyle labels, e.g. Nocturne "Dive"/"Duelist", Galio "Battlecaster"/"Crowd Control", Shen "Ally Protection"/"Duelist", Annie "Summon"/"Burst". These map directly to behavioural tags (Dive → `dive`, Ally Protection → `peel`, Crowd Control → `cc`, Burst → `burst`).
- `tacticalInfo`: `style` (0–10 slider, 0 = auto-attack, 10 = ability reliant), `difficulty` 1–3, `damageType` (`kPhysical`, `kMagic`, `kMixed`), `attackType` (`melee`/`ranged`).
- `playstyleInfo`: `damage`, `durability`, `crowdControl`, `mobility`, `utility`, each 1–3.

**LoL Wiki champion classes** ([wiki.leagueoflegends.com/en-us/Champion_classes](https://wiki.leagueoflegends.com/en-us/Champion_classes)): 7 classes / 13 subclasses with curated membership – Tank {Vanguard, Warden}, Fighter {Juggernaut, Diver}, Slayer {Assassin, Skirmisher}, Mage {Burst, Battlemage, Artillery}, Controller {Enchanter, Catcher}, Marksman, Specialist. Subclass is the single most informative free attribute: Vanguard ≈ engage tank, Warden ≈ peel tank, Diver ≈ dive, Juggernaut ≈ splitpush/frontline, Skirmisher ≈ duelist/split, Artillery ≈ poke, Enchanter ≈ protect/disengage, Catcher ≈ pick. Not available as an API; scrape once or hand-copy (~170 rows).

### 5.2 Proposed schema (conceptual, one record per champion; role-specific overrides where noted)

Identity
- `id` (Riot key), `name`, `patch_seen`

Roles and pool (per team, not per champion – separate table): `role ∈ {top, jng, mid, bot, sup}`, `player`, `tier ∈ {comfort, good, okay}`, optional `games`, `winrate`. Viable roles per champion for the *opponent inference*: `common_roles` with a weight (derived from the imported opponent data or a curated default).

Derived automatically (cdragon / ddragon)
- `class_tags` (Fighter/Tank/…), `subclass` (wiki), `damage_type ∈ {AD, AP, mixed}`, `attack_type ∈ {melee, ranged}`, `range_class ∈ {melee, short(<=350), mid(351–550), long(>550)}` from `attackrange`
- `r_damage`, `r_durability`, `r_cc`, `r_mobility`, `r_utility` (1–3 from playstyleInfo)
- `riot_playstyle_primary/secondary` (championTagPrimary/Secondary)

Curated behavioural tags (boolean or 0–3 strength; the core of the rule engine)
- Fight initiation: `engage`, `dive`, `gap_close`, `disengage`, `counter_engage`, `peel`
- Damage pattern: `burst`, `sustained_dps`, `poke`, `aoe_damage`, `hypercarry`, `anti_tank` (% HP / true damage / armor shred), `anti_heal` (built-in), `anti_shield`
- Control: `hard_cc_score` 0–3, `aoe_cc`, `pick_cc` (single-target lockdown / hook), `knockup` (Yasuo synergy)
- Map: `global`, `semi_global`, `roam`, `splitpush`, `duelist`, `waveclear`, `siege` (tower damage), `vision_control`, `objective_control`
- Durability/utility: `frontline`, `tank`, `sustain`, `shield_heal`, `spell_shield`, `cc_immunity`, `stealth_or_untargetable`
- Power curve: `early`, `mid`, `late` each 0–3 (or a single `scaling ∈ {early, mid, late, flat}`)
- Draft meta-attributes (per champion **per role**): `blind_safe` 0–3, `counter_sensitivity` 0–3, `flex_roles` (list), `meta_tier` (imported/editable per patch), `ban_priority` (editable)

Relations (separate tables, sparse, curated or imported)
- `counters(a, b, role, strength)` – lane/role matchup edges (can be seeded from public counter stats if the user imports them; otherwise hand-maintained for the team's own pool).
- `synergy(a, b, strength, reason)` – e.g. knock-up + Yasuo, Lulu + hypercarry, Orianna + diver, Galio + dive.

Archetype detection uses only the tag columns: e.g. `global_comp = count(global ∨ semi_global) >= 3`, `engage_comp = sum(engage) >= 2 ∧ sum(aoe_cc) >= 2`, `poke_comp = count(poke ∧ range_class == long) >= 3`, `protect_comp = count(hypercarry) >= 1 ∧ sum(peel ∨ disengage) >= 2`, `split_comp = count(splitpush ∧ duelist) >= 1 ∧ sum(waveclear ∨ disengage on remaining) >= 2`, `pick_comp = sum(pick_cc) >= 2 ∧ sum(burst) >= 2`.

Automation coverage estimate: identity, class, damage/attack type, range, the five 1–3 ratings and Riot playstyle labels come from data files; subclass from the wiki table; roughly 20 behavioural tags need one curated pass per champion (a spreadsheet the team can edit), with patch-to-patch changes rare except `meta_tier`/`ban_priority`.

---

## 6. Worked example: enemy locks Nocturne, Galio, Shen

**State after Pick Phase 1 (we are blue, they are red; they have R1 Nocturne, R2 Galio, R3 Shen).**

Champion data the engine holds:

| Champion | cdragon roles | Riot tags | dmg | attack | curated tags |
|---|---|---|---|---|---|
| Nocturne | fighter, assassin | Dive / Duelist | AD | melee | `semi_global` (R Paranoia: global vision denial + long dash), `dive`, `pick_cc`(fear), `spell_shield`(W), `splitpush`, `early/mid` |
| Galio | tank, mage | Battlecaster / Crowd Control | AP | melee | `semi_global` (R Hero's Entrance to ally), `engage`, `aoe_cc` (knock-up, taunt), `frontline`, `anti_ap` (magic shield), `counter_engage`, `mid` |
| Shen | tank | Ally Protection / Duelist | mixed | melee | `global` (R Stand United shield + teleport), `frontline`, `peel`, `splitpush`, `aoe_cc`(taunt), `waveclear` weak, `mid/late` |

**Detection.** `count(global ∨ semi_global) = 3 → GLOBAL/ROAM comp` (confidence high because all three are ally-targeted or map-wide arrivals). Secondary signals: `engage` (Galio + Nocturne) → they want to collapse on a single lane / an isolated target: a *Pick + Global* hybrid. Remaining enemy roles inferred from common roles: Nocturne → jungle, Galio → mid (or support), Shen → top (or support); so their open roles are bot + one of {mid, support}. Their AD/AP profile so far: 1 AD (Nocturne), 1 AP (Galio), 1 mixed (Shen) – balanced; their damage so far is low (`r_damage` 3+2+2) → they will need a real carry in bot/mid.

**What the archetype table says the weaknesses are** (§2.1 Global row, Dignitas global-ults guide, NerfPlz global comp): the comp converts isolated skirmishes into numbers advantages, but (1) each piece is individually below par in a 5v5 (Shen and Galio deal little damage; Nocturne is a squishy melee), (2) it is cooldown-gated (Shen R 200 s+, Nocturne R ~150 s, Galio R ~180 s early), (3) it needs targets to be isolated and unwarded, (4) Nocturne's dive is stopped by spell shields, knockbacks and peel, (5) Nocturne's R is countered by disengage cast during his flight and by Stopwatch/Zhonya's/Edge of Night.

**Rules that fire and their recommendations:**

- `enemy.archetype == GLOBAL` → raise weight of `disengage`, `peel`, `vision_control`, `waveclear`, `self_peel` carries; lower weight of our own `splitpush` picks (splitting is what they punish) unless our splitter has `global`/`escape` (e.g. Shen mirror is banned to us? no, Shen is taken; Twisted Fate / Ryze could be recommended as a split-with-escape flex).
- `enemy.dive_score >= 2 (Nocturne + Galio)` → recommend anti-dive support/peel: Janna, Lulu, Morgana (spell shield stops Nocturne fear), Alistar/Braum, Poppy (W stops Nocturne's dash outright, flex top/jng/sup) → Poppy is a top-scored answer because she also fits top counterpick vs Shen.
- `enemy.damage_score low ∧ enemy.frontline high (Galio, Shen)` → prefer `anti_tank`/`sustained_dps` hypercarry (Vayne, Kog'Maw, Jinx, Kai'Sa) in a Protect / Front-to-back plan; the RPS table says Protect beats Dive/Engage.
- `enemy.magic_damage relies on Galio` and Galio has `anti_ap` → do not stack AP; keep at least two AD carries; AP mid with mobility (Ahri, Sylas) rather than immobile mages that Nocturne dives.
- Our comp target: **Front-to-back / Protect with disengage**, e.g. Poppy or Ornn top, Sejuani/Maokai jungle (tank with AoE lockdown to punish grouped arrivals), Ahri/Orianna mid (Orianna ball on the dived carry is a classic anti-dive tool), Kai'Sa/Jinx bot, Janna/Lulu/Morgana support. Alternative plan: **Pick comp with vision** (Ashe arrow reveals and catches Nocturne; Thresh lantern + hook) since Pick beats Split and the global pieces often split.
- Objective note for the coach panel: "Ward deep, group when Nocturne R is up, force fights when Shen/Galio R are down; do not send a lone splitter."

**Ban Phase 2 (red bans first, then we ban):**
- Their open roles: bot + mid/support. Rules: (a) *complete-the-archetype denial* – ban remaining `global/semi_global/roam` pieces that would push them to 4–5 globals: Twisted Fate, Pantheon, Ryze, Karthus, Taliyah; (b) *cut best remaining role options* – the top meta ADC and the best remaining engage/pick support for their comp (e.g. Rell, Nautilus, Rakan); (c) *protect our shown picks* – if we have locked an immobile hypercarry, ban the remaining assassin/dive threats (Zed, Talon, Rengar) that would join the collapse.
- Ranking among candidates uses `ban_priority` (meta), opponent-player comfort (target bans) and the archetype-completion score; two bans → typically one archetype-completion ban and one meta/target ban.

**Sanity check.** This matches the human coaching advice for playing against global comps (vision, grouping, punish downtime, spell shields, out-scale) and yields concrete champions the team can filter through its own pool tiers – exactly what the tool should output: ranked candidates per remaining role with the rule(s) that fired as the explanation.

Sources: [Dignitas – global & semi-global ultimates](https://dignitas.gg/articles/a-guide-to-global-and-semi-global-ultimates-in-league-of-legends), [NerfPlz – The Global Comp](https://www.nerfplz.com/2012/07/top-team-comps-4-global-comp.html), [MobaFire – Nocturne vs Shen](https://www.mobafire.com/league-of-legends/forum/theory-crafting/nocturne-counters-shen-13657), cdragon champion files for [Nocturne](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/56.json), [Galio](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/3.json), [Shen](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/98.json).

---

## 7. Open questions for the design phase

1. Which format is primary: Tournament Draft (team acts as one, has ban phase 2) or Ranked flex (five individual ban decisions, no reaction bans)? Recommendation: build the state machine for Tournament Draft and model Ranked as a degenerate case (one ban window, picks 1-2-2-2-2-1).
2. Where does `meta_tier` / `ban_priority` come from offline? Options: manual list per patch, or a one-off CSV import from a stats site the user exports themselves.
3. Should `counters(a,b)` be hand-curated only for the team's own pool (small, high quality) or imported wholesale? Curated-for-pool is the smaller and more honest scope.
4. How to handle role inference for enemy champions – a static `common_roles` table with weights, updated by the optional opponent-data import.
5. Fearless: per-series unavailable set, plus a "pool depth for game N" warning.

## Source index

- LoL Wiki – Draft Pick: https://wiki.leagueoflegends.com/en-us/Draft_Pick
- LoL Wiki – Team drafting (tournament draft order and timers): https://wiki.leagueoflegends.com/en-us/Team_drafting
- LoL Wiki – V25.23 champ select timer changes: https://wiki.leagueoflegends.com/en-us/V25.23
- LoL Wiki – Champion classes: https://wiki.leagueoflegends.com/en-us/Champion_classes
- Mobalytics – Picks and bans in pro play: https://mobalytics.gg/blog/picks-bans-guide/
- Mobalytics – team comp guides (engage, counter-engage, poke, dive, 1-3-1, teamfighting): https://mobalytics.gg/lol/guides/everything-you-need-to-know-about-team-comps-and-teamfighting
- Mobalytics – Best blind pick champions: https://mobalytics.gg/lol/guides/best-blind-pick-champions
- Leaguepedia – Team Compositions: https://lol.fandom.com/wiki/New_To_League/Meta/Team_Compositions
- ChampBop – Team compositions explained: https://champbop.com/league-of-legends/league-of-legends-team-compositions-explained/
- Backdash – Complete guide to team compositions: https://www.thebackdash.com/league-of-legends/complete-guide-to-team-compositions-in-lol
- Guild Order – Draft & champ select theory: https://guildorder.com/games/league/guides/draft-and-champ-select-theory
- LoL-Tracker – Tournament draft strategy: https://lol-tracker.com/blog/tournament-draft-lol-pick-and-ban-strategy-for-teams
- Dignitas – Win before you play (draft phase): https://dignitas.gg/articles/blogs/League-of-Legends/14665/win-before-you-play-navigating-draft-phase-in-league-of-legends
- Dignitas – In-depth drafting guide for ranked: https://dignitas.gg/articles/an-in-depth-drafting-guide-for-ranked-games-league-of-legends
- Dignitas – Best champions for blind picking: https://dignitas.gg/articles/blogs/Unknown/14738/the-best-champions-for-blind-picking-in-lol
- Dignitas – Global and semi-global ultimates: https://dignitas.gg/articles/a-guide-to-global-and-semi-global-ultimates-in-league-of-legends
- Boosting Market – Counter-pick guide by lane: https://boostingmarket.com/blogs/lol-counter-pick-guide-by-lane/
- Boosting Market – Draft phase guide: https://boostingmarket.com/blogs/lol-draft-phase-guide/
- coachailytics – Guide to picks and bans: https://coachailytics.com/guide-to-picks-and-bans-in-league-of-legends/
- OneEsports – What is Fearless Draft: https://www.oneesports.gg/league-of-legends/what-is-fearless-draft/
- LoLTheory – Full vs soft fearless: https://blog.loltheory.gg/what-is-fearless-draft/
- esports.gg – First Selection explained: https://esports.gg/news/league-of-legends/first-selection-explained/
- Community Dragon docs: https://www.communitydragon.org/documentation/assets ; raw champion files: https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/
- Data Dragon champion.json mirror: https://github.com/noxelisdev/LoL_DDragon/blob/master/latest/data/en_US/champion.json
- PlayVS LoL rulebook (40 s draft timers in that league): https://help.playvs.com/en/articles/4919212-league-of-legends-rulebook
- Riot /dev: On Launching 10 Bans (2017, duplicate cross-team bans allowed): https://nexus.leagueoflegends.com/en-us/2017/05/dev-10-bans-arrives/
