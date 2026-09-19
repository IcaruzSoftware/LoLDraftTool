import type { Position } from '../data/types';
import { POSITIONS } from '../data/types';
import type { Champion } from '../data/curatedTypes';
import type { PickSlot } from '../engine/draft';
import { SKIP_ID } from '../engine/draft';
import type { RoleInference } from '../engine/roles';
import type { TeamPool } from '../engine/pool';
import { ChampionSquare } from './ChampionSquare';
import { ROLE_LABEL } from './format';

interface OurProps {
  picks: PickSlot[];
  pool: TeamPool;
  roles: RoleInference;
  championMap: Map<number, Champion>;
  /** Role whose slot is the active pick target (our turn). */
  activeRole?: Position;
  onSetRole: (slotIndex: number, role: Position) => void;
}

/** Our five picks in role order, with player name and a role override. */
export function OurColumn({ picks, pool, roles, championMap, activeRole, onSetRole }: OurProps): React.JSX.Element {
  const byRole = new Map<Position, { championId: number; slotIndex: number }>();
  for (const a of roles.assignments) {
    const slotIndex = picks.findIndex((p) => p.championId === a.championId);
    byRole.set(a.role, { championId: a.championId, slotIndex });
  }

  return (
    <div className="team-col us">
      {POSITIONS.map((role) => {
        const entry = byRole.get(role);
        const champ = entry ? championMap.get(entry.championId) : undefined;
        const player = pool[role].player;
        const classes = ['pick-slot'];
        if (!entry) classes.push('empty');
        if (activeRole === role && !entry) classes.push('active');
        return (
          <div key={role} className={classes.join(' ')}>
            <span className="role-tag">{ROLE_LABEL[role]}</span>
            <ChampionSquare champion={champ} size={42} />
            <div className="pick-meta">
              <span className="pick-name">{champ ? champ.name : '—'}</span>
              {player && <span className="pick-sub">{player}</span>}
              {entry && entry.slotIndex >= 0 && (
                <select
                  className="role-select"
                  value={role}
                  onChange={(e) => onSetRole(entry.slotIndex, e.target.value as Position)}
                >
                  {POSITIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TheirProps {
  picks: PickSlot[];
  roles: RoleInference;
  championMap: Map<number, Champion>;
  /** Index of the slot being picked now (their turn), or -1. */
  activeIndex?: number;
}

/** The opponent's picks in pick order with inferred role + confidence. */
export function TheirColumn({ picks, roles, championMap, activeIndex = -1 }: TheirProps): React.JSX.Element {
  const real = picks.filter((p) => p.championId !== SKIP_ID);
  return (
    <div className="team-col them">
      {Array.from({ length: 5 }, (_, i) => {
        const a = roles.assignments[i];
        const champ = a ? championMap.get(a.championId) : undefined;
        const skipped = real.length <= i && picks[i]?.championId === SKIP_ID;
        const classes = ['pick-slot'];
        if (!a) classes.push('empty');
        if (i === activeIndex && !a) classes.push('active');
        return (
          <div key={i} className={classes.join(' ')}>
            <ChampionSquare champion={champ} size={42} />
            <div className="pick-meta">
              <span className="pick-name">{champ ? champ.name : skipped ? '(skipped)' : '—'}</span>
              {a && (
                <span className="pick-sub">
                  {ROLE_LABEL[a.role]} {Math.round(a.confidence * 100)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
