import { useEffect, useMemo, useRef, useState } from 'react';
import type { Position } from '../data/types';
import { POSITIONS } from '../data/types';
import type { Champion } from '../data/curatedTypes';
import type { DraftState } from '../engine/draft';
import type { TeamPool } from '../engine/pool';
import { ChampionSquare } from './ChampionSquare';
import { ROLE_LABEL } from './format';

interface Props {
  champions: Champion[];
  draft: DraftState;
  pool: TeamPool;
  topRecId: number | undefined;
  isOurPickTurn: boolean;
  isBanStep: boolean;
  onApply: (id: number) => void;
  onSkip: () => void;
}

type RoleFilter = 'all' | Position;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Reason a champion cannot be applied at the current step, or null. */
function unavailableReason(draft: DraftState, id: number): string | null {
  if (draft.fearlessUnavailable.includes(id)) return 'Fearless';
  if (draft.bans.us.includes(id) || draft.bans.them.includes(id)) return 'Banned';
  if (draft.picks.us.some((p) => p.championId === id) || draft.picks.them.some((p) => p.championId === id))
    return 'Picked';
  return null;
}

export function ChampionGrid({
  champions,
  draft,
  pool,
  topRecId,
  isOurPickTurn,
  isBanStep,
  onApply,
  onSkip,
}: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [poolOnly, setPoolOnly] = useState(isOurPickTurn);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset pool-only default whenever it swaps between our picks and other steps.
  useEffect(() => {
    setPoolOnly(isOurPickTurn);
  }, [isOurPickTurn]);

  // Typing anywhere focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const poolIds = useMemo(() => {
    const set = new Set<number>();
    for (const role of POSITIONS) {
      const rp = pool[role];
      for (const id of [...rp.comfort, ...rp.good, ...rp.okay]) set.add(id);
    }
    return set;
  }, [pool]);

  const q = normalize(search);
  const filtered = useMemo(() => {
    return champions
      .filter((c) => {
        if (roleFilter !== 'all' && (c.positions[roleFilter] ?? 0) <= 0) return false;
        if (poolOnly && !poolIds.has(c.id)) return false;
        if (q && !normalize(c.name).includes(q) && !normalize(c.alias).includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, roleFilter, poolOnly, poolIds, q]);

  function applyFromKeyboard(): void {
    if (q.length === 0) {
      if (topRecId !== undefined && unavailableReason(draft, topRecId) === null) onApply(topRecId);
      return;
    }
    const match = filtered.find((c) => unavailableReason(draft, c.id) === null);
    if (match) {
      onApply(match.id);
      setSearch('');
    }
  }

  return (
    <div className="grid-panel">
      <div className="grid-controls">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search champions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyFromKeyboard();
          }}
          autoFocus
        />
        <div className="toggle-group">
          {(['all', ...POSITIONS] as RoleFilter[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`filter-btn${roleFilter === r ? ' active' : ''}`}
              onClick={() => setRoleFilter(r)}
            >
              {r === 'all' ? 'All' : ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`filter-btn${poolOnly ? ' active' : ''}`}
          onClick={() => setPoolOnly((v) => !v)}
        >
          Pool only
        </button>
        {isBanStep && (
          <button type="button" onClick={onSkip}>
            Skip / no ban
          </button>
        )}
      </div>
      <div className="champ-grid">
        {filtered.map((c) => {
          const reason = unavailableReason(draft, c.id);
          return (
            <button
              key={c.id}
              type="button"
              className="grid-cell"
              disabled={reason !== null}
              title={reason ? `${c.name} — ${reason}` : c.name}
              onClick={() => onApply(c.id)}
            >
              <ChampionSquare champion={c} size={64} dimmed={reason !== null} />
              <span className="grid-name">{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
