import { describe, it, expect } from 'vitest';
import {
  applyChampion,
  buildSteps,
  createDraft,
  currentStep,
  finishBanPhase,
  isAvailable,
  isComplete,
  restart,
  skipStep,
  undo,
  type Step,
} from './draft';

const seq = (steps: Step[]) => steps.map((s) => `${s.team}-${s.action}`);

describe('buildSteps — tournament', () => {
  it('produces the exact 20-step order for blue (first pick)', () => {
    expect(seq(buildSteps('tournament', 'blue'))).toEqual([
      'us-ban', 'them-ban', 'us-ban', 'them-ban', 'us-ban', 'them-ban',
      'us-pick', 'them-pick', 'them-pick', 'us-pick', 'us-pick', 'them-pick',
      'them-ban', 'us-ban', 'them-ban', 'us-ban',
      'them-pick', 'us-pick', 'us-pick', 'them-pick',
    ]);
  });

  it('mirrors the order for red', () => {
    expect(seq(buildSteps('tournament', 'red'))).toEqual([
      'them-ban', 'us-ban', 'them-ban', 'us-ban', 'them-ban', 'us-ban',
      'them-pick', 'us-pick', 'us-pick', 'them-pick', 'them-pick', 'us-pick',
      'us-ban', 'them-ban', 'us-ban', 'them-ban',
      'us-pick', 'them-pick', 'them-pick', 'us-pick',
    ]);
  });

  it('has 10 bans and 10 picks and correct phases', () => {
    const steps = buildSteps('tournament', 'blue');
    expect(steps.filter((s) => s.action === 'ban')).toHaveLength(10);
    expect(steps.filter((s) => s.action === 'pick')).toHaveLength(10);
    expect(steps.slice(0, 6).every((s) => s.phase === 1)).toBe(true);
    expect(steps.slice(12, 16).every((s) => s.phase === 2)).toBe(true);
  });
});

describe('buildSteps — ranked', () => {
  it('has 5 us then 5 them bans, then 1-2-2-2-2-1 picks', () => {
    expect(seq(buildSteps('ranked', 'blue'))).toEqual([
      'us-ban', 'us-ban', 'us-ban', 'us-ban', 'us-ban',
      'them-ban', 'them-ban', 'them-ban', 'them-ban', 'them-ban',
      'us-pick', 'them-pick', 'them-pick', 'us-pick', 'us-pick',
      'them-pick', 'them-pick', 'us-pick', 'us-pick', 'them-pick',
    ]);
  });
});

describe('availability & application', () => {
  it('marks applied champions unavailable and advances the cursor', () => {
    let s = createDraft({ format: 'tournament', side: 'blue' });
    expect(currentStep(s)?.action).toBe('ban');
    s = applyChampion(s, 56);
    expect(s.cursor).toBe(1);
    expect(s.bans.us).toEqual([56]);
    expect(isAvailable(s, 56)).toBe(false);
    expect(() => applyChampion(s, 56)).toThrow();
  });

  it('tournament bans block picks for both teams', () => {
    let s = createDraft({ format: 'tournament', side: 'blue' });
    s = applyChampion(s, 10); // us ban
    // advance to a pick step and confirm 10 cannot be picked
    while (currentStep(s)?.action !== 'pick') s = skipStep(s);
    expect(() => applyChampion(s, 10)).toThrow();
  });

  it('ranked allows cross-team duplicate bans but not within a team', () => {
    let s = createDraft({ format: 'ranked', side: 'blue' });
    s = applyChampion(s, 10); // us ban 1
    s = applyChampion(s, 11);
    s = applyChampion(s, 12);
    s = applyChampion(s, 13);
    s = applyChampion(s, 14); // now cursor at first them ban
    expect(currentStep(s)?.team).toBe('them');
    s = applyChampion(s, 10); // them may re-ban 10
    expect(s.bans.them[0]).toBe(10);
    expect(() => applyChampion(s, 10)).toThrow(); // but not twice within a team
  });

  it('honors the fearless-unavailable set', () => {
    const s = createDraft({ format: 'tournament', side: 'blue', fearlessUnavailable: [99] });
    expect(isAvailable(s, 99)).toBe(false);
    expect(() => applyChampion(s, 99)).toThrow();
  });
});

describe('undo / restart / skip / finishBanPhase', () => {
  it('undo reverts the last action', () => {
    let s = createDraft({ format: 'tournament', side: 'blue' });
    s = applyChampion(s, 1);
    s = applyChampion(s, 2);
    s = undo(s);
    expect(s.cursor).toBe(1);
    expect(s.bans.us).toEqual([1]);
    expect(s.bans.them).toEqual([]);
  });

  it('undo on a fresh draft is a no-op', () => {
    const s = createDraft({ format: 'tournament', side: 'blue' });
    expect(undo(s).cursor).toBe(0);
  });

  it('restart clears actions but keeps format/side/fearless', () => {
    let s = createDraft({ format: 'tournament', side: 'red', fearlessUnavailable: [7] });
    s = applyChampion(s, 1);
    s = applyChampion(s, 2);
    const r = restart(s);
    expect(r.cursor).toBe(0);
    expect(r.bans).toEqual({ us: [], them: [] });
    expect(r.side).toBe('red');
    expect(r.fearlessUnavailable).toEqual([7]);
  });

  it('finishBanPhase jumps ranked to the first pick', () => {
    let s = createDraft({ format: 'ranked', side: 'blue' });
    s = applyChampion(s, 1); // one ban only
    s = finishBanPhase(s);
    expect(currentStep(s)?.action).toBe('pick');
    expect(currentStep(s)?.team).toBe('us');
  });

  it('runs a full tournament draft to completion', () => {
    let s = createDraft({ format: 'tournament', side: 'blue' });
    let id = 100;
    while (!isComplete(s)) s = applyChampion(s, id++);
    expect(isComplete(s)).toBe(true);
    expect(s.bans.us.length + s.bans.them.length).toBe(10);
    expect(s.picks.us.length + s.picks.them.length).toBe(10);
  });
});
