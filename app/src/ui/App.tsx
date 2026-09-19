import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Champion, Counter, Synergy } from '../data/curatedTypes';
import type { LoadedData } from '../data/loadChampions';
import { loadAll } from '../data/loadChampions';
import { createNameResolver } from '../import/names';
import type { NameResolver } from '../import/types';
import { initialState, reducer } from '../state/reducer';
import { loadSetup, saveSetup } from '../state/persistence';
import { Setup } from './Setup';
import { DraftScreen } from './DraftScreen';

interface Runtime {
  champions: Champion[];
  championMap: Map<number, Champion>;
  knownIds: Set<number>;
  synergies: Synergy[];
  counters: Counter[];
  resolver: NameResolver;
}

export function App(): React.JSX.Element {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const base = initialState();
    const saved = loadSetup();
    return saved ? { ...base, setup: { ...base.setup, ...saved } } : base;
  });

  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveSetup(state.setup);
  }, [state.setup]);

  const runtime = useMemo<Runtime | null>(() => {
    if (!data) return null;
    return {
      champions: data.champions,
      championMap: new Map(data.champions.map((c) => [c.id, c])),
      knownIds: new Set(data.champions.map((c) => c.id)),
      synergies: data.synergies,
      counters: data.counters,
      resolver: createNameResolver(data.champions),
    };
  }, [data]);

  if (error) {
    return (
      <div className="app-root">
        <div className="status-screen">
          <h1 className="heading">LoLDraftTool</h1>
          <p className="error-text">Failed to load champion data: {error}</p>
          <p className="muted">Run `pnpm fetch-data` to generate the dataset, then reload.</p>
        </div>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="app-root">
        <div className="status-screen">
          <h1 className="heading">LoLDraftTool</h1>
          <p className="muted">Loading champions…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      {state.screen === 'setup' ? (
        <Setup
          setup={state.setup}
          resolver={runtime.resolver}
          knownIds={runtime.knownIds}
          dispatch={dispatch}
        />
      ) : (
        <DraftScreen state={state} runtime={runtime} dispatch={dispatch} />
      )}
    </div>
  );
}
