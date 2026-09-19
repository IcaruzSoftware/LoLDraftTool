import type { Position } from '../data/types';

/** One champion's game record for an opponent player. */
export interface OpponentChampion {
  championId: number;
  games: number;
  wins: number;
}

/** A single opponent player and their champion history. */
export interface OpponentPlayer {
  name: string;
  role?: Position;
  champions: OpponentChampion[];
}

/** Imported opponent scouting data. */
export interface OpponentData {
  players: OpponentPlayer[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Threat of a champion given opponent data: for each player who plays it,
 * weights the champion's games-share by win rate, boosts one-tricks, and scales
 * down players whose role is not among the enemy's still-open roles. Returns the
 * strongest such signal, 0..1.
 */
export function opponentThreat(
  data: OpponentData,
  championId: number,
  openEnemyRoles: Position[],
): number {
  let best = 0;
  for (const player of data.players) {
    const total = player.champions.reduce((s, c) => s + c.games, 0);
    if (total === 0) continue;
    const entry = player.champions.find((c) => c.championId === championId);
    if (!entry || entry.games === 0) continue;

    const share = entry.games / total;
    const winrate = entry.wins / entry.games;
    const otp = share > 0.6 ? 0.2 : 0; // one-trick boost
    // role relevance: unknown role -> mild; known but not open -> low.
    const roleFactor = player.role ? (openEnemyRoles.includes(player.role) ? 1 : 0.4) : 0.8;

    const score = (share * (0.5 + winrate) + otp) * roleFactor;
    best = Math.max(best, score);
  }
  return clamp01(best);
}
