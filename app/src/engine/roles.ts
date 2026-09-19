import type { Position } from '../data/types';
import { POSITIONS } from '../data/types';
import type { Champion } from '../data/curatedTypes';
import type { PickSlot } from './draft';
import { SKIP_ID } from './draft';
import type { TeamPool } from './pool';
import { poolTier } from './pool';

/** Small weight given to a role a champion is not listed for. */
const EPSILON = 0.05;

/** One resolved role assignment for a pick. */
export interface RoleAssignment {
  championId: number;
  role: Position;
  confidence: number;
}

/** Result of a role inference/assignment: per-pick roles plus the open roles. */
export interface RoleInference {
  assignments: RoleAssignment[];
  openRoles: Position[];
}

function positionWeight(champ: Champion | undefined, role: Position): number {
  const w = champ?.positions[role] ?? 0;
  return w > 0 ? w : EPSILON;
}

/** Per-pick confidence: how dominant its assigned role is over its next-best role. */
function roleConfidence(champ: Champion | undefined, role: Position): number {
  const assigned = positionWeight(champ, role);
  let bestOther = 0;
  for (const p of POSITIONS) {
    if (p === role) continue;
    bestOther = Math.max(bestOther, positionWeight(champ, p));
  }
  return assigned / (assigned + bestOther);
}

/**
 * Infers enemy roles by brute force: finds the assignment of distinct roles to
 * the picked champions that maximises the product of position weights (unlisted
 * roles use a small epsilon). User-set roles on slots are respected. Returns
 * per-pick role + confidence and the set of still-open enemy roles.
 */
export function inferEnemyRoles(picks: PickSlot[], champions: Map<number, Champion>): RoleInference {
  const real = picks.filter((p) => p.championId !== SKIP_ID);
  const champs = real.map((p) => champions.get(p.championId));

  let best: { roles: Position[]; product: number } | null = null;

  const assign = (i: number, used: Set<Position>, roles: Position[], product: number): void => {
    if (i === real.length) {
      if (!best || product > best.product) best = { roles: [...roles], product };
      return;
    }
    const fixed = real[i]!.role;
    const candidates = fixed ? [fixed] : POSITIONS;
    for (const role of candidates) {
      if (used.has(role)) continue;
      used.add(role);
      roles.push(role);
      assign(i + 1, used, roles, product * positionWeight(champs[i], role));
      roles.pop();
      used.delete(role);
    }
  };
  assign(0, new Set(), [], 1);

  const chosen = best ? (best as { roles: Position[] }).roles : [];
  const assignments: RoleAssignment[] = real.map((p, i) => {
    const role = chosen[i] ?? POSITIONS[i]!;
    return { championId: p.championId, role, confidence: roleConfidence(champs[i], role) };
  });
  const takenRoles = new Set(assignments.map((a) => a.role));
  const openRoles = POSITIONS.filter((p) => !takenRoles.has(p));
  return { assignments, openRoles };
}

/**
 * Assigns our own picks to roles by team-pool membership: a pick belongs to the
 * role whose pool contains it. Unique membership and user-set roles are taken
 * first; ambiguous picks are resolved against the remaining open roles.
 */
export function assignOurRoles(picks: PickSlot[], pool: TeamPool): RoleInference {
  const real = picks.filter((p) => p.championId !== SKIP_ID);
  const open = new Set<Position>(POSITIONS);
  const assignments: RoleAssignment[] = [];
  const pending: { pick: PickSlot; roles: Position[] }[] = [];

  // Pass 1: fixed (user override) and unique pool membership.
  for (const pick of real) {
    if (pick.role && open.has(pick.role)) {
      open.delete(pick.role);
      assignments.push({ championId: pick.championId, role: pick.role, confidence: 1 });
      continue;
    }
    const roles = POSITIONS.filter((p) => poolTier(pool, p, pick.championId) !== null);
    if (roles.length === 1) {
      const role = roles[0]!;
      if (open.has(role)) open.delete(role);
      assignments.push({ championId: pick.championId, role, confidence: 1 });
    } else {
      pending.push({ pick, roles });
    }
  }

  // Pass 2: ambiguous / not-in-pool picks -> first open role in candidate set.
  for (const { pick, roles } of pending) {
    const candidates = roles.length > 0 ? roles : POSITIONS;
    const role = candidates.find((p) => open.has(p)) ?? POSITIONS.find((p) => open.has(p)) ?? candidates[0]!;
    open.delete(role);
    assignments.push({
      championId: pick.championId,
      role,
      confidence: roles.length > 0 ? 0.6 : 0.3,
    });
  }

  return { assignments, openRoles: POSITIONS.filter((p) => open.has(p)) };
}
