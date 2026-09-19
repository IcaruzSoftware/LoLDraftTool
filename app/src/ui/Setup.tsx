import { useState } from 'react';
import type { Position } from '../data/types';
import { POSITIONS } from '../data/types';
import type { NameResolver } from '../import/types';
import { parseTeamPool } from '../import/teamPool';
import { parseOpponents } from '../import/opponents';
import { fetchOpponentsFromMultilink } from '../import/opggFetch';
import type { OpponentData } from '../engine/opponents';
import { pickAndReadTextFile } from '../platform/index';
import type { Action, SetupState } from '../state/reducer';
import { buildDemoPool } from './demoPool';
import { ROLE_LABEL } from './format';

interface Props {
  setup: SetupState;
  resolver: NameResolver;
  knownIds: Set<number>;
  dispatch: React.Dispatch<Action>;
}

const FILE_ACCEPT = '.json,.csv,application/json,text/csv';

function names(ids: number[], resolver: NameResolver): string {
  return ids.map((id) => resolver.nameOf(id) ?? `#${id}`).join(', ') || '—';
}

export function Setup({ setup, resolver, knownIds, dispatch }: Props): React.JSX.Element {
  const [paste, setPaste] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [pasteRole, setPasteRole] = useState<'' | Position>('');
  const [link, setLink] = useState('');
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState('');
  const [fetchError, setFetchError] = useState('');

  async function importPool(): Promise<void> {
    const file = await pickAndReadTextFile(FILE_ACCEPT);
    if (!file) return;
    const { pool, warnings } = parseTeamPool(file.text, resolver);
    dispatch({ type: 'SET_POOL', pool, warnings, label: file.name });
  }

  function useDemoPool(): void {
    dispatch({ type: 'SET_POOL', pool: buildDemoPool(resolver), warnings: [], label: 'Demo pool' });
  }

  async function importOpponents(): Promise<void> {
    const file = await pickAndReadTextFile(FILE_ACCEPT);
    if (!file) return;
    const { data, warnings } = parseOpponents(file.text, resolver);
    dispatch({ type: 'SET_OPPONENTS', data, warnings });
  }

  function addFromPaste(): void {
    if (paste.trim().length === 0) return;
    const { data, warnings } = parseOpponents(paste, resolver, {
      playerName: pasteName || undefined,
      role: pasteRole || undefined,
    });
    const merged: OpponentData = {
      players: [...(setup.opponents?.players ?? []), ...data.players],
    };
    dispatch({ type: 'SET_OPPONENTS', data: merged, warnings });
    setPaste('');
    setPasteName('');
    setPasteRole('');
  }

  async function fetchFromLink(): Promise<void> {
    if (link.trim().length === 0 || fetching) return;
    setFetching(true);
    setFetchError('');
    setProgress('Starting…');
    try {
      const { data, warnings } = await fetchOpponentsFromMultilink(link, resolver, {
        knownIds,
        concurrency: 2,
        delayMs: 400,
        onProgress: (done, total, name) => setProgress(`Fetching ${done}/${total}: ${name}…`),
      });
      if (data.players.length === 0) {
        setFetchError(warnings[0] ?? 'No players found');
      } else {
        dispatch({ type: 'SET_OPPONENTS', data, warnings });
        setProgress(`Fetched ${data.players.length} players.`);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  function setFearless(text: string): void {
    const ids: number[] = [];
    for (const part of text.split(',')) {
      const name = part.trim();
      if (name.length === 0) continue;
      const res = resolver.resolve(name);
      if (!('error' in res)) ids.push(res.id);
    }
    dispatch({ type: 'SET_FEARLESS', ids, text });
  }

  return (
    <div className="setup">
      <h1>LoLDraftTool</h1>

      <section className="card">
        <h2>Format &amp; side</h2>
        <div className="row">
          <div className="toggle-group" role="group" aria-label="Draft format">
            <button
              type="button"
              className={setup.format === 'tournament' ? 'active' : ''}
              onClick={() => dispatch({ type: 'SET_FORMAT', format: 'tournament' })}
            >
              Tournament Draft
            </button>
            <button
              type="button"
              className={setup.format === 'ranked' ? 'active' : ''}
              onClick={() => dispatch({ type: 'SET_FORMAT', format: 'ranked' })}
            >
              Ranked Draft
            </button>
          </div>
          <div className="toggle-group" role="group" aria-label="Side">
            <button
              type="button"
              className={setup.side === 'blue' ? 'active us' : ''}
              onClick={() => dispatch({ type: 'SET_SIDE', side: 'blue' })}
            >
              Blue (first pick)
            </button>
            <button
              type="button"
              className={setup.side === 'red' ? 'active them' : ''}
              onClick={() => dispatch({ type: 'SET_SIDE', side: 'red' })}
            >
              Red
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Team pool</h2>
        <div className="row">
          <button type="button" onClick={() => void importPool()}>
            Import team pool (JSON/CSV)
          </button>
          <button type="button" onClick={useDemoPool}>
            Use demo pool
          </button>
          {setup.poolLabel && <span className="muted">Loaded: {setup.poolLabel}</span>}
        </div>
        <table className="summary-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Player</th>
              <th>Comfort</th>
              <th>Good</th>
              <th>Okay</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((role) => {
              const rp = setup.pool[role];
              return (
                <tr key={role}>
                  <td>{ROLE_LABEL[role]}</td>
                  <td>{rp.player ?? '—'}</td>
                  <td>{names(rp.comfort, resolver)}</td>
                  <td>{names(rp.good, resolver)}</td>
                  <td>{names(rp.okay, resolver)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {setup.poolWarnings.length > 0 && (
          <ul className="warnings">
            {setup.poolWarnings.map((w, i) => (
              <li key={i} className="warn-tag">
                {w}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Opponents (optional)</h2>
        <div className="row">
          <button type="button" onClick={() => void importOpponents()}>
            Import opponents (JSON/CSV)
          </button>
          {setup.opponents && (
            <button type="button" onClick={() => dispatch({ type: 'CLEAR_OPPONENTS' })}>
              Clear
            </button>
          )}
        </div>
        <div className="row">
          <input
            type="text"
            placeholder="Player name"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <select
            className="role-select"
            value={pasteRole}
            onChange={(e) => setPasteRole(e.target.value as '' | Position)}
          >
            <option value="">Role?</option>
            {POSITIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button type="button" onClick={addFromPaste}>
            Add from op.gg paste
          </button>
        </div>
        <textarea
          placeholder="Paste an op.gg champions table here…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="row">
          <input
            type="text"
            placeholder="op.gg multi-search link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="button" onClick={() => void fetchFromLink()} disabled={fetching}>
            {fetching ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
        {progress && <span className="muted">{progress}</span>}
        {fetchError && <span className="warn-tag">{fetchError}</span>}
        {setup.opponents && setup.opponents.players.length > 0 && (
          <table className="summary-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Top champions</th>
              </tr>
            </thead>
            <tbody>
              {setup.opponents.players.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>
                    <select
                      className="role-select"
                      value={p.role ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_OPPONENT_ROLE',
                          index: i,
                          role: (e.target.value as '' | Position) || undefined,
                        })
                      }
                    >
                      <option value="">?</option>
                      {POSITIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {[...p.champions]
                      .sort((a, b) => b.games - a.games)
                      .slice(0, 5)
                      .map((c) => {
                        const wr = c.games > 0 ? Math.round((c.wins / c.games) * 100) : 0;
                        const name = resolver.nameOf(c.championId) ?? `#${c.championId}`;
                        return `${name} (${c.games}g ${wr}%)`;
                      })
                      .join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {setup.opponentWarnings.length > 0 && (
          <ul className="warnings">
            {setup.opponentWarnings.map((w, i) => (
              <li key={i} className="warn-tag">
                {w}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card collapse">
        <summary>Fearless unavailable (optional)</summary>
        <p className="muted">Comma-separated champion names already used this series.</p>
        <input
          type="text"
          placeholder="e.g. Ahri, Lee Sin, Jinx"
          value={setup.fearlessText}
          onChange={(e) => setFearless(e.target.value)}
        />
        {setup.fearlessUnavailable.length > 0 && (
          <span className="muted">{names(setup.fearlessUnavailable, resolver)}</span>
        )}
      </details>

      <div className="row">
        <button type="button" className="btn-primary" onClick={() => dispatch({ type: 'START_DRAFT' })}>
          Start Draft
        </button>
      </div>

      <p className="muted app-version">v{import.meta.env.VITE_APP_VERSION ?? 'dev'}</p>
    </div>
  );
}
