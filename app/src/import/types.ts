import type { Position } from '../data/types';

/**
 * Output of a successful champion-name resolution.
 */
export type ResolveOk = { id: number };
export type ResolveError = { error: string; suggestions: string[] };
export type ResolveResult = ResolveOk | ResolveError;

export interface NameResolver {
  /** Resolve a free-text champion name/alias to a champion id. */
  resolve(input: string): ResolveResult;
  /** Display name for a champion id, if known. */
  nameOf(id: number): string | undefined;
}

/**
 * Structurally compatible with the engine's `TeamPool` (app/src/engine/pool.ts).
 * A champion pool per role, split into three comfort tiers plus an optional
 * player name.
 */
export type TeamPool = Record<
  Position,
  { comfort: number[]; good: number[]; okay: number[]; player?: string }
>;

/**
 * Structurally compatible with the engine's `OpponentData`
 * (app/src/engine/opponents.ts).
 */
export type OpponentData = {
  players: Array<{
    name: string;
    role?: Position;
    champions: Array<{ championId: number; games: number; wins: number }>;
  }>;
};
