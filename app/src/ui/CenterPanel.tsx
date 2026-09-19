import type { Champion } from '../data/curatedTypes';
import type { Step } from '../engine/draft';
import type { DraftSummary, Recommendation } from '../engine/recommend';
import type { ArchetypeScores } from '../engine/profile';
import { ARCHETYPE_LABEL } from '../engine/profile';
import { RecommendationCard } from './RecommendationCard';

interface Props {
  summary: DraftSummary;
  step: Step;
  recs: Recommendation[];
  championMap: Map<number, Champion>;
  isOurTurn: boolean;
  isRankedBan: boolean;
  onLock: (id: number) => void;
  onFinishBans: () => void;
}

function archChips(scores: ArchetypeScores, side: 'us' | 'them'): React.JSX.Element[] {
  const out: React.JSX.Element[] = [];
  const label = side === 'us' ? 'Us' : 'Them';
  const add = (a: typeof scores.primary): void => {
    if (!a) return;
    out.push(
      <span key={`${side}-${a}`} className={`chip ${side}`}>
        {label}: {ARCHETYPE_LABEL[a]}
      </span>,
    );
  };
  add(scores.primary);
  add(scores.secondary);
  return out;
}

export function CenterPanel({
  summary,
  step,
  recs,
  championMap,
  isOurTurn,
  isRankedBan,
  onLock,
  onFinishBans,
}: Props): React.JSX.Element {
  const isBan = step.action === 'ban';
  const lockLabel = isBan ? 'Ban' : 'Lock in';
  const [top, ...rest] = recs;
  const alts = rest.slice(0, 2);

  return (
    <div className="center">
      <div className="comp-line">
        <span className="comp-target">{summary.compTargetText}</span>
        <div className="chips">
          {archChips(summary.enemyArchetypes, 'them')}
          {archChips(summary.ourArchetypes, 'us')}
        </div>
        {summary.warnings.length > 0 && (
          <div className="chips">
            {summary.warnings.map((w) => (
              <span key={w.code} className="chip warn">
                {w.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {isOurTurn ? (
        <div className="rec-area">
          {isRankedBan && (
            <p className="muted">Ranked bans are simultaneous — pick your targets, then confirm.</p>
          )}
          {top ? (
            <>
              <RecommendationCard
                rec={top}
                champion={championMap.get(top.championId)}
                large
                lockLabel={lockLabel}
                onLock={onLock}
              />
              {alts.length > 0 && (
                <div className="alts">
                  {alts.map((rec) => (
                    <RecommendationCard
                      key={rec.championId}
                      rec={rec}
                      champion={championMap.get(rec.championId)}
                      large={false}
                      lockLabel={lockLabel}
                      onLock={onLock}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">No recommendation available — pick from the grid below.</p>
          )}
          {isRankedBan && (
            <div className="row">
              <button type="button" className="btn-primary" onClick={onFinishBans}>
                Bans done
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="hint-box them">
          <strong>Enter the opponent&apos;s {isBan ? 'ban' : 'pick'}</strong>
          <p className="muted">
            Select the champion they {isBan ? 'banned' : 'picked'} from the grid below so the engine can
            keep advising you.
          </p>
        </div>
      )}
    </div>
  );
}
