export const POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
export type Position = (typeof POSITIONS)[number];

export type DamageType = 'AD' | 'AP' | 'mixed';
export type AttackType = 'melee' | 'ranged';

export interface ChampionBase {
  id: number;
  alias: string;
  name: string;
  /** Coarse Data Dragon classes (Fighter, Mage, ...). */
  riotTags: string[];
  damageType: DamageType;
  attackType: AttackType;
  /** Base attack range (Data Dragon stats.attackrange). */
  range: number;
  /** Meraki positions -> weight; first listed 1.0, others 0.8. */
  positions: Partial<Record<Position, number>>;
  /** Community Dragon client ratings, 0..3. */
  playstyle: {
    damage: number;
    durability: number;
    crowdControl: number;
    mobility: number;
    utility: number;
  };
  riotPlaystylePrimary: string;
  riotPlaystyleSecondary: string;
  /** Community Dragon tacticalInfo.difficulty, 1..3. */
  difficulty: number;
  merakiRoles: string[];
  adaptiveType?: string;
  resource?: string;
  releaseDate?: string;
}
