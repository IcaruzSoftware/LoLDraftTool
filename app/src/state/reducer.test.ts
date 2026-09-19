import { describe, expect, it } from 'vitest';
import { countUndosToClear, initialState, reducer } from './reducer';
import type { AppState } from './reducer';

function apply(state: AppState, id: number): AppState {
  return reducer(state, { type: 'APPLY_CHAMPION', id });
}

describe('reducer', () => {
  it('updates setup format and side', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_FORMAT', format: 'ranked' });
    s = reducer(s, { type: 'SET_SIDE', side: 'red' });
    expect(s.setup.format).toBe('ranked');
    expect(s.setup.side).toBe('red');
  });

  it('starts a draft honouring format and side', () => {
    let s = initialState();
    s = reducer(s, { type: 'SET_FORMAT', format: 'ranked' });
    s = reducer(s, { type: 'START_DRAFT' });
    expect(s.screen).toBe('draft');
    expect(s.draft?.format).toBe('ranked');
    expect(s.draft?.cursor).toBe(0);
  });

  it('applies a champion to the current step and undoes it', () => {
    let s = reducer(initialState(), { type: 'START_DRAFT' });
    s = apply(s, 10);
    expect(s.draft?.cursor).toBe(1);
    // Tournament first step is a ban; blue side => us.
    expect(s.draft?.bans.us).toContain(10);

    const undone = reducer(s, { type: 'UNDO' });
    expect(undone.draft?.cursor).toBe(0);
    expect(undone.draft?.bans.us).toHaveLength(0);
  });

  it('ignores illegal moves (duplicate ban)', () => {
    let s = reducer(initialState(), { type: 'START_DRAFT' });
    s = apply(s, 10);
    const before = s.draft?.cursor;
    s = apply(s, 10); // already banned -> no-op
    expect(s.draft?.cursor).toBe(before);
  });

  it('counts undos needed to clear a slot', () => {
    let s = reducer(initialState(), { type: 'SET_FORMAT', format: 'ranked' });
    s = reducer(s, { type: 'START_DRAFT' });
    s = apply(s, 10);
    s = apply(s, 11);
    s = apply(s, 12);
    const d = s.draft!;
    expect(countUndosToClear(d, 'us', 'ban', 0)).toBe(3);
    expect(countUndosToClear(d, 'us', 'ban', 2)).toBe(1);
    expect(countUndosToClear(d, 'us', 'ban', 4)).toBe(0);

    s = reducer(s, { type: 'UNDO_TIMES', count: 3 });
    expect(s.draft?.bans.us).toHaveLength(0);
  });

  it('sets and clears opponents', () => {
    let s = initialState();
    s = reducer(s, {
      type: 'SET_OPPONENTS',
      data: { players: [{ name: 'Faker', champions: [] }] },
      warnings: [],
    });
    expect(s.setup.opponents?.players).toHaveLength(1);
    s = reducer(s, { type: 'CLEAR_OPPONENTS' });
    expect(s.setup.opponents).toBeNull();
  });
});
