import type { Position } from '../data/types';
import type { DraftFormat, DraftState, Side, Team } from '../engine/draft';
import {
  applyChampion,
  createDraft,
  finishBanPhase,
  restart,
  setPickRole,
  skipStep,
  undo,
} from '../engine/draft';
import type { TeamPool } from '../engine/pool';
import { emptyPool } from '../engine/pool';
import type { OpponentData } from '../engine/opponents';

/** Which top-level screen is showing. */
export type Screen = 'setup' | 'draft';

/** Everything configured on the setup screen (also what we persist). */
export interface SetupState {
  format: DraftFormat;
  side: Side;
  pool: TeamPool;
  poolWarnings: string[];
  /** Label for the loaded pool (filename or "Demo pool"); null when none. */
  poolLabel: string | null;
  opponents: OpponentData | null;
  opponentWarnings: string[];
  fearlessUnavailable: number[];
  /** Raw text kept for the fearless input so it round-trips. */
  fearlessText: string;
}

/** Top-level app state: current screen, setup config, and the live draft. */
export interface AppState {
  screen: Screen;
  setup: SetupState;
  draft: DraftState | null;
}

/** Fresh app state with an empty setup. */
export function initialState(): AppState {
  return {
    screen: 'setup',
    setup: {
      format: 'tournament',
      side: 'blue',
      pool: emptyPool(),
      poolWarnings: [],
      poolLabel: null,
      opponents: null,
      opponentWarnings: [],
      fearlessUnavailable: [],
      fearlessText: '',
    },
    draft: null,
  };
}

export type Action =
  | { type: 'SET_FORMAT'; format: DraftFormat }
  | { type: 'SET_SIDE'; side: Side }
  | { type: 'SET_POOL'; pool: TeamPool; warnings: string[]; label: string }
  | { type: 'SET_OPPONENTS'; data: OpponentData; warnings: string[] }
  | { type: 'CLEAR_OPPONENTS' }
  | { type: 'SET_OPPONENT_ROLE'; index: number; role: Position | undefined }
  | { type: 'SET_FEARLESS'; ids: number[]; text: string }
  | { type: 'START_DRAFT' }
  | { type: 'APPLY_CHAMPION'; id: number }
  | { type: 'SKIP_STEP' }
  | { type: 'UNDO' }
  | { type: 'UNDO_TIMES'; count: number }
  | { type: 'SET_ROLE'; team: Team; slotIndex: number; role: Position | undefined }
  | { type: 'FINISH_BAN_PHASE' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_SETUP' }
  | { type: 'HYDRATE'; state: AppState };

function withSetup(state: AppState, patch: Partial<SetupState>): AppState {
  return { ...state, setup: { ...state.setup, ...patch } };
}

/** Return a copy of an opponent player without its `role` field. */
function omitRole(
  player: OpponentData['players'][number],
): OpponentData['players'][number] {
  return { name: player.name, champions: player.champions };
}

/** Applies a draft-mutating engine function, ignoring illegal moves. */
function mutateDraft(state: AppState, fn: (d: DraftState) => DraftState): AppState {
  if (!state.draft) return state;
  try {
    return { ...state, draft: fn(state.draft) };
  } catch {
    return state;
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FORMAT':
      return withSetup(state, { format: action.format });
    case 'SET_SIDE':
      return withSetup(state, { side: action.side });
    case 'SET_POOL':
      return withSetup(state, { pool: action.pool, poolWarnings: action.warnings, poolLabel: action.label });
    case 'SET_OPPONENTS':
      return withSetup(state, { opponents: action.data, opponentWarnings: action.warnings });
    case 'CLEAR_OPPONENTS':
      return withSetup(state, { opponents: null, opponentWarnings: [] });
    case 'SET_OPPONENT_ROLE': {
      if (!state.setup.opponents) return state;
      const players = state.setup.opponents.players.map((p, i) =>
        i === action.index ? (action.role ? { ...p, role: action.role } : omitRole(p)) : p,
      );
      return withSetup(state, { opponents: { players } });
    }
    case 'SET_FEARLESS':
      return withSetup(state, { fearlessUnavailable: action.ids, fearlessText: action.text });
    case 'START_DRAFT':
      return {
        ...state,
        screen: 'draft',
        draft: createDraft({
          format: state.setup.format,
          side: state.setup.side,
          fearlessUnavailable: state.setup.fearlessUnavailable,
        }),
      };
    case 'APPLY_CHAMPION':
      return mutateDraft(state, (d) => applyChampion(d, action.id));
    case 'SKIP_STEP':
      return mutateDraft(state, (d) => skipStep(d));
    case 'UNDO':
      return mutateDraft(state, (d) => undo(d));
    case 'UNDO_TIMES': {
      let count = action.count;
      return mutateDraft(state, (d) => {
        let cur = d;
        while (count-- > 0) cur = undo(cur);
        return cur;
      });
    }
    case 'SET_ROLE':
      return mutateDraft(state, (d) => setPickRole(d, action.team, action.slotIndex, action.role));
    case 'FINISH_BAN_PHASE':
      return mutateDraft(state, (d) => finishBanPhase(d));
    case 'RESTART':
      return mutateDraft(state, (d) => restart(d));
    case 'BACK_TO_SETUP':
      return { ...state, screen: 'setup', draft: null };
    case 'HYDRATE':
      return action.state;
    default:
      return state;
  }
}

/**
 * Number of undo steps needed to clear a filled ban/pick slot (and everything
 * drafted after it). Zero if the slot is already empty. Used to warn before an
 * undo that removes more than one action.
 */
export function countUndosToClear(
  draft: DraftState,
  team: Team,
  kind: 'ban' | 'pick',
  index: number,
): number {
  const present = (d: DraftState): boolean =>
    kind === 'ban' ? d.bans[team][index] !== undefined : d.picks[team][index] !== undefined;
  if (!present(draft)) return 0;
  let cur = draft;
  let n = 0;
  while (present(cur) && cur.history.length > 0) {
    cur = undo(cur);
    n += 1;
  }
  return n;
}
