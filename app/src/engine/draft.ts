import type { Position } from '../data/types';

/** Draft format: full sequential tournament, or ranked (one ban window). */
export type DraftFormat = 'tournament' | 'ranked';
/** Map side. */
export type Side = 'blue' | 'red';
/** Which team a step belongs to, relative to us. */
export type Team = 'us' | 'them';

/** One step of a draft. */
export interface Step {
  index: number;
  team: Team;
  action: 'ban' | 'pick';
  phase: 1 | 2;
}

/** A locked pick, with an optionally-assigned role. */
export interface PickSlot {
  championId: number;
  role?: Position;
}

/** Full, serialisable draft state. History snapshots omit their own history. */
export interface DraftState {
  format: DraftFormat;
  side: Side;
  steps: Step[];
  cursor: number;
  bans: { us: number[]; them: number[] };
  picks: { us: PickSlot[]; them: PickSlot[] };
  fearlessUnavailable: number[];
  history: DraftState[];
}

/** Options for {@link createDraft}. */
export interface CreateDraftOptions {
  format: DraftFormat;
  side: Side;
  fearlessUnavailable?: number[];
}

/** Sentinel championId for a skipped ban/pick ("none"/unknown). */
export const SKIP_ID = -1;

type SideAction = { side: Side; action: 'ban' | 'pick'; phase: 1 | 2 };

// Tournament order in blue/red terms (docs/research/domain.md §1.1).
const TOURNAMENT: SideAction[] = [
  // ban phase 1: B R B R B R
  { side: 'blue', action: 'ban', phase: 1 },
  { side: 'red', action: 'ban', phase: 1 },
  { side: 'blue', action: 'ban', phase: 1 },
  { side: 'red', action: 'ban', phase: 1 },
  { side: 'blue', action: 'ban', phase: 1 },
  { side: 'red', action: 'ban', phase: 1 },
  // pick phase 1: B R R B B R
  { side: 'blue', action: 'pick', phase: 1 },
  { side: 'red', action: 'pick', phase: 1 },
  { side: 'red', action: 'pick', phase: 1 },
  { side: 'blue', action: 'pick', phase: 1 },
  { side: 'blue', action: 'pick', phase: 1 },
  { side: 'red', action: 'pick', phase: 1 },
  // ban phase 2: R B R B (red starts)
  { side: 'red', action: 'ban', phase: 2 },
  { side: 'blue', action: 'ban', phase: 2 },
  { side: 'red', action: 'ban', phase: 2 },
  { side: 'blue', action: 'ban', phase: 2 },
  // pick phase 2: R B B R
  { side: 'red', action: 'pick', phase: 2 },
  { side: 'blue', action: 'pick', phase: 2 },
  { side: 'blue', action: 'pick', phase: 2 },
  { side: 'red', action: 'pick', phase: 2 },
];

// Ranked picks in blue/red terms: B R R B B R R B B R (1-2-2-2-2-1).
const RANKED_PICKS: Side[] = ['blue', 'red', 'red', 'blue', 'blue', 'red', 'red', 'blue', 'blue', 'red'];

function toTeam(ourSide: Side, stepSide: Side): Team {
  return stepSide === ourSide ? 'us' : 'them';
}

/**
 * Builds the ordered step list for a format and our side. Tournament maps the
 * fixed blue/red order to us/them; ranked has 10 bans (5 us then 5 them) then
 * the 10-pick B/R order mapped to us/them.
 */
export function buildSteps(format: DraftFormat, side: Side): Step[] {
  const steps: Step[] = [];
  if (format === 'tournament') {
    TOURNAMENT.forEach((s) => {
      steps.push({ index: steps.length, team: toTeam(side, s.side), action: s.action, phase: s.phase });
    });
    return steps;
  }
  // ranked: bans are per-team (5 us then 5 them), one hidden phase.
  for (let i = 0; i < 5; i++) steps.push({ index: steps.length, team: 'us', action: 'ban', phase: 1 });
  for (let i = 0; i < 5; i++) steps.push({ index: steps.length, team: 'them', action: 'ban', phase: 1 });
  RANKED_PICKS.forEach((s) => {
    steps.push({ index: steps.length, team: toTeam(side, s), action: 'pick', phase: 1 });
  });
  return steps;
}

/** Creates a fresh draft at cursor 0. */
export function createDraft(opts: CreateDraftOptions): DraftState {
  return {
    format: opts.format,
    side: opts.side,
    steps: buildSteps(opts.format, opts.side),
    cursor: 0,
    bans: { us: [], them: [] },
    picks: { us: [], them: [] },
    fearlessUnavailable: [...(opts.fearlessUnavailable ?? [])],
    history: [],
  };
}

/** The step at the cursor, or `undefined` when the draft is complete. */
export function currentStep(state: DraftState): Step | undefined {
  return state.steps[state.cursor];
}

/** True once every step has been consumed. */
export function isComplete(state: DraftState): boolean {
  return state.cursor >= state.steps.length;
}

/** Whether a champion may be *picked* (not banned by anyone, picked, or fearless-locked). */
export function isAvailable(state: DraftState, championId: number): boolean {
  if (championId === SKIP_ID) return false;
  if (state.fearlessUnavailable.includes(championId)) return false;
  if (state.bans.us.includes(championId) || state.bans.them.includes(championId)) return false;
  if (state.picks.us.some((p) => p.championId === championId)) return false;
  if (state.picks.them.some((p) => p.championId === championId)) return false;
  return true;
}

/** Deep-ish clone of the mutable parts, with an empty history (used for snapshots). */
function clone(state: DraftState, history: DraftState[]): DraftState {
  return {
    format: state.format,
    side: state.side,
    steps: state.steps,
    cursor: state.cursor,
    bans: { us: [...state.bans.us], them: [...state.bans.them] },
    picks: { us: state.picks.us.map((p) => ({ ...p })), them: state.picks.them.map((p) => ({ ...p })) },
    fearlessUnavailable: [...state.fearlessUnavailable],
    history,
  };
}

function snapshot(state: DraftState): DraftState {
  return clone(state, []);
}

/** True if a champion can legally be applied at the current step. */
function canApply(state: DraftState, championId: number): boolean {
  const step = currentStep(state);
  if (!step || championId === SKIP_ID) return false;
  if (state.fearlessUnavailable.includes(championId)) return false;
  // Cannot ban or pick an already-picked champion.
  if (state.picks.us.some((p) => p.championId === championId)) return false;
  if (state.picks.them.some((p) => p.championId === championId)) return false;

  if (step.action === 'ban') {
    if (state.format === 'ranked') {
      // Cross-team duplicate bans allowed; not within a team.
      return !state.bans[step.team].includes(championId);
    }
    // Tournament: a banned champion is gone for everyone.
    return !state.bans.us.includes(championId) && !state.bans.them.includes(championId);
  }
  // pick
  return isAvailable(state, championId);
}

/**
 * Applies a champion to the current step and advances the cursor. Throws if the
 * champion is not applicable (banned/picked/fearless, or duplicate within team).
 */
export function applyChampion(state: DraftState, championId: number): DraftState {
  const step = currentStep(state);
  if (!step) throw new Error('Draft is already complete');
  if (!canApply(state, championId)) {
    throw new Error(`Champion ${championId} is not available for this step`);
  }
  const next = clone(state, [...state.history, snapshot(state)]);
  if (step.action === 'ban') next.bans[step.team].push(championId);
  else next.picks[step.team].push({ championId });
  next.cursor += 1;
  return next;
}

/** Skips the current step, recording a SKIP_ID ban/pick ("none"/unknown). */
export function skipStep(state: DraftState): DraftState {
  const step = currentStep(state);
  if (!step) throw new Error('Draft is already complete');
  const next = clone(state, [...state.history, snapshot(state)]);
  if (step.action === 'ban') next.bans[step.team].push(SKIP_ID);
  else next.picks[step.team].push({ championId: SKIP_ID });
  next.cursor += 1;
  return next;
}

/** Reverts the most recent action. No-op if there is nothing to undo. */
export function undo(state: DraftState): DraftState {
  const prev = state.history[state.history.length - 1];
  if (!prev) return state;
  return clone(prev, state.history.slice(0, -1));
}

/** Sets (or clears) the role of a locked pick. Not tracked by undo. */
export function setPickRole(
  state: DraftState,
  team: Team,
  slotIndex: number,
  role: Position | undefined,
): DraftState {
  const next = clone(state, state.history);
  const slot = next.picks[team][slotIndex];
  if (slot) slot.role = role;
  return next;
}

/**
 * Ranked only: ends the ban window by jumping the cursor to the first pick step,
 * even if some ban slots were left empty.
 */
export function finishBanPhase(state: DraftState): DraftState {
  const firstPick = state.steps.findIndex((s) => s.action === 'pick');
  if (firstPick < 0 || state.cursor >= firstPick) return state;
  const next = clone(state, [...state.history, snapshot(state)]);
  next.cursor = firstPick;
  return next;
}

/** Restarts the draft, keeping format, side and the fearless set. */
export function restart(state: DraftState): DraftState {
  return createDraft({
    format: state.format,
    side: state.side,
    fearlessUnavailable: state.fearlessUnavailable,
  });
}
