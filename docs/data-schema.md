# Data Schema

Full data schema referenced from [architecture.md](architecture.md#data-model). Sourced from [research/domain.md §5.2](research/domain.md#52-proposed-schema-conceptual-one-record-per-champion-role-specific-overrides-where-noted) and [research/data-sources.md §3.1](research/data-sources.md#31-meraki-analytics-cdn-positions--fine-roles). TypeScript-like notation; not literal code.

## Champion record

Generated (ddragon + cdragon + Meraki, merged at build time) and curated (hand-maintained) data merged into one record per champion, loaded at runtime from `app/public/data/champions.json`.

```ts
type Champion = {
  id: number;                 // Riot numeric key
  alias: string;               // ddragon id, e.g. "MonkeyKing"
  name: string;

  // generated
  riotTags: string[];          // Fighter/Tank/Mage/Assassin/Support/Marksman (ddragon)
  damageType: 'AD' | 'AP' | 'mixed';
  attackType: 'melee' | 'ranged';
  range: number;                // attackrange
  positions: {                  // Meraki, weight 0..1; overridable via curated/meta.json
    top: number; jungle: number; mid: number; bot: number; support: number;
  };
  playstyle: { damage: number; durability: number; crowdControl: number; mobility: number; utility: number }; // 1-3, cdragon playstyleInfo
  riotPlaystylePrimary: string;   // cdragon championTagPrimary
  riotPlaystyleSecondary: string; // cdragon championTagSecondary
  subclass: string;               // LoL Wiki, one of 13 subclasses

  // curated (data/curated/tags.json) — 0-3 unless noted as boolean
  tags: {
    // fight initiation
    engage: number; dive: number; gapClose: number; disengage: number; counterEngage: number; peel: number;
    // damage pattern
    burst: number; sustainedDps: number; poke: number; aoeDamage: number; hypercarry: boolean;
    antiTank: number; antiHeal: boolean; antiShield: boolean;
    // control
    hardCc: number; aoeCc: number; pickCc: number; knockup: boolean;
    // map
    global: boolean; semiGlobal: boolean; roam: number; splitpush: number; duelist: number;
    waveclear: number; siege: number; visionControl: number;
    // durability/utility
    frontline: boolean; tank: boolean; sustain: number; shieldHeal: number; spellShield: boolean;
    ccImmunity: boolean; stealthUntargetable: boolean;
    // power curve
    early: number; mid: number; late: number;
  };

  // curated, per role
  perRole: Partial<Record<'top'|'jungle'|'mid'|'bot'|'support', {
    blindSafe: number;          // 0-3
    counterSensitivity: number; // 0-3
  }>>;
  flexRoles: Array<'top'|'jungle'|'mid'|'bot'|'support'>;
};
```

## Meta (per patch) — `data/curated/meta.json`

```ts
type ChampionMeta = {
  championId: number;
  patch: string;
  tierByPosition: Partial<Record<'top'|'jungle'|'mid'|'bot'|'support', 'S'|'A'|'B'|'C'|'D'>>;
  banPriority: number; // 0-3
};
```

## Synergies — `data/curated/synergies.json`

```ts
type Synergy = { a: number; b: number; strength: 1 | 2 | 3; reason: string };
```

## Counters — `data/curated/counters.json`

`champion` beats `counters` in `role`.

```ts
type Counter = { champion: number; counters: number; role: 'top'|'jungle'|'mid'|'bot'|'support'; strength: 1 | 2 | 3; reason: string };
```

## Team pool import (user format)

JSON, tolerant key aliases per role (`Toplane`/`top`, `jgl`/`jungle`, `midlane`/`mid`, `adc`/`bot`/`bottom`, `supp`/`support`) and fuzzy champion-name resolution (case/punctuation-insensitive: `"Kaisa"` → Kai'Sa, `"MF"` → Miss Fortune, via an alias table).

```json
{
  "top": { "comfort": ["Aatrox"], "good": ["Camille"], "okay": ["Gnar"] },
  "jungle": { "comfort": [], "good": [], "okay": [] },
  "mid": { "comfort": [], "good": [], "okay": [] },
  "bot": { "comfort": [], "good": [], "okay": [] },
  "support": { "comfort": [], "good": [], "okay": [] }
}
```

CSV equivalent: `role,tier,champion` rows. Optional per-role player name field.

## Opponents import

JSON:

```json
{
  "players": [
    { "name": "Player#TAG", "role": "mid", "champions": [ { "name": "Aurora", "games": 55, "wins": 32, "kda": 3.13 } ] }
  ]
}
```

CSV: `player,role,champion,games,wins`.

op.gg paste: tolerant line parser matching champion name + `NNW NNL` pattern (see [research/data-sources.md §4.1](research/data-sources.md#41-opgg)).
