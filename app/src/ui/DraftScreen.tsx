import { useMemo, useState } from 'react';
import type { Position } from '../data/types';
import type { Champion, Counter, Synergy } from '../data/curatedTypes';
import { currentStep, isComplete } from '../engine/draft';
import type { RecommendContext } from '../engine/recommend';
import { draftSummary, recommendBans, recommendPicks } from '../engine/recommend';
import { ARCHETYPE_LABEL } from '../engine/profile';
import { assignOurRoles, inferEnemyRoles } from '../engine/roles';
import { saveTextFile } from '../platform/index';
import type { Action, AppState } from '../state/reducer';
import { countUndosToClear } from '../state/reducer';
import { BanRow } from './BanRow';
import { CenterPanel } from './CenterPanel';
import { ChampionGrid } from './ChampionGrid';
import { OurColumn, TheirColumn } from './TeamColumn';
import { RestartDialog } from './RestartDialog';

interface Runtime {
  champions: Champion[];
  championMap: Map<number, Champion>;
  synergies: Synergy[];
  counters: Counter[];
}

interface Props {
  state: AppState;
  runtime: Runtime;
  dispatch: React.Dispatch<Action>;
}

interface Confirm {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function DraftScreen({ state, runtime, dispatch }: Props): React.JSX.Element {
  const draft = state.draft!;
  const { pool } = state.setup;
  const { champions, championMap, synergies, counters } = runtime;
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const ourRoles = useMemo(() => assignOurRoles(draft.picks.us, pool), [draft.picks.us, pool]);
  const enemyRoles = useMemo(
    () => inferEnemyRoles(draft.picks.them, championMap),
    [draft.picks.them, championMap],
  );

  const ctx = useMemo<RecommendContext>(
    () => ({
      state: draft,
      champions: championMap,
      synergies,
      counters,
      pool,
      opponents: state.setup.opponents ?? undefined,
      ourRoles,
      enemyRoles,
    }),
    [draft, championMap, synergies, counters, pool, state.setup.opponents, ourRoles, enemyRoles],
  );

  const summary = useMemo(() => draftSummary(ctx), [ctx]);
  const step = currentStep(draft);
  const complete = isComplete(draft);
  const isOurTurn = step?.team === 'us';

  const recs = useMemo(() => {
    if (!step || step.team !== 'us') return [];
    return step.action === 'ban' ? recommendBans(ctx) : recommendPicks(ctx);
  }, [ctx, step]);

  const pulseRole: Position | undefined =
    isOurTurn && step?.action === 'pick' ? recs[0]?.role : undefined;

  // ----- header -----
  let stepText = 'DRAFT COMPLETE';
  if (step) {
    const total = draft.steps.filter((s) => s.team === step.team && s.action === step.action).length;
    const ordinal = draft.steps
      .slice(0, draft.cursor + 1)
      .filter((s) => s.team === step.team && s.action === step.action).length;
    const phase = step.action === 'ban' ? `BAN PHASE ${step.phase}` : 'PICK';
    const who = step.team === 'us' ? 'Your' : "Opponent's";
    stepText = `${phase} — ${who} ${step.action} (${ordinal} of ${total})`;
  }

  const usBanActive = step?.action === 'ban' && step.team === 'us' ? draft.bans.us.length : -1;
  const themBanActive = step?.action === 'ban' && step.team === 'them' ? draft.bans.them.length : -1;

  // ----- handlers -----
  function removeSlot(team: 'us' | 'them', kind: 'ban' | 'pick', index: number): void {
    const count = countUndosToClear(draft, team, kind, index);
    if (count <= 0) return;
    if (count > 1) {
      setConfirm({
        title: 'Undo multiple actions?',
        message: `This will undo ${count} actions drafted after this slot.`,
        confirmLabel: `Undo ${count}`,
        onConfirm: () => {
          dispatch({ type: 'UNDO_TIMES', count });
          setConfirm(null);
        },
      });
    } else {
      dispatch({ type: 'UNDO_TIMES', count });
    }
  }

  function exportDraft(): void {
    saveTextFile('draft.json', JSON.stringify(draft, null, 2));
  }

  function askRestart(): void {
    setConfirm({
      title: 'Restart draft?',
      message: 'Picks and bans will be cleared. Setup stays.',
      confirmLabel: 'Restart',
      onConfirm: () => {
        dispatch({ type: 'RESTART' });
        setConfirm(null);
      },
    });
  }

  function askBackToSetup(): void {
    setConfirm({
      title: 'Back to setup?',
      message: 'The current draft will be discarded.',
      confirmLabel: 'Back to setup',
      onConfirm: () => {
        dispatch({ type: 'BACK_TO_SETUP' });
        setConfirm(null);
      },
    });
  }

  return (
    <div className="draft">
      <header className="draft-header">
        <span className="step-text">{stepText}</span>
        <div className="dots">
          {draft.steps.map((s, i) => {
            const classes = ['dot', s.team];
            if (i < draft.cursor) classes.push('done');
            if (i === draft.cursor) classes.push('current');
            return <span key={i} className={classes.join(' ')} />;
          })}
        </div>
        <span className={`side-badge ${draft.side}`}>{draft.side.toUpperCase()}</span>
      </header>

      <div className="ban-rows">
        <BanRow
          team="us"
          bans={draft.bans.us}
          championMap={championMap}
          activeIndex={usBanActive}
          onRemove={(i) => removeSlot('us', 'ban', i)}
        />
        <BanRow
          team="them"
          bans={draft.bans.them}
          championMap={championMap}
          activeIndex={themBanActive}
          onRemove={(i) => removeSlot('them', 'ban', i)}
        />
      </div>

      <div className="draft-body">
        <OurColumn
          picks={draft.picks.us}
          pool={pool}
          roles={ourRoles}
          championMap={championMap}
          pulseRole={pulseRole}
          onSetRole={(slotIndex, role) =>
            dispatch({ type: 'SET_ROLE', team: 'us', slotIndex, role })
          }
        />

        {complete ? (
          <div className="center">
            <div className="complete-banner">
              <h2>Draft Complete</h2>
              <p className="comp-target">{summary.compTargetText}</p>
              <div className="chips" style={{ justifyContent: 'center' }}>
                {summary.ourArchetypes.primary && (
                  <span className="chip us">
                    Us: {ARCHETYPE_LABEL[summary.ourArchetypes.primary]}
                  </span>
                )}
                {summary.enemyArchetypes.primary && (
                  <span className="chip them">
                    Them: {ARCHETYPE_LABEL[summary.enemyArchetypes.primary]}
                  </span>
                )}
              </div>
              {summary.warnings.length > 0 && (
                <div className="chips" style={{ justifyContent: 'center' }}>
                  {summary.warnings.map((w) => (
                    <span key={w.code} className="chip warn">
                      {w.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          step && (
            <div className="center">
              <CenterPanel
                summary={summary}
                step={step}
                recs={recs}
                championMap={championMap}
                isOurTurn={!!isOurTurn}
                isRankedBan={draft.format === 'ranked' && step.action === 'ban' && step.team === 'us'}
                onLock={(id) => dispatch({ type: 'APPLY_CHAMPION', id })}
                onFinishBans={() => dispatch({ type: 'FINISH_BAN_PHASE' })}
              />
              <ChampionGrid
                champions={champions}
                draft={draft}
                pool={pool}
                topRecId={recs[0]?.championId}
                isOurPickTurn={!!isOurTurn && step.action === 'pick'}
                isBanStep={step.action === 'ban'}
                onApply={(id) => dispatch({ type: 'APPLY_CHAMPION', id })}
                onSkip={() => dispatch({ type: 'SKIP_STEP' })}
              />
            </div>
          )
        )}

        <TheirColumn picks={draft.picks.them} roles={enemyRoles} championMap={championMap} />
      </div>

      <footer className="draft-footer">
        <button type="button" onClick={() => dispatch({ type: 'UNDO' })}>
          Undo
        </button>
        <button type="button" onClick={askRestart}>
          Restart
        </button>
        <button type="button" onClick={askBackToSetup}>
          Back to setup
        </button>
        <span className="spacer" />
        <button type="button" onClick={exportDraft}>
          Export draft
        </button>
      </footer>

      {confirm && (
        <RestartDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
