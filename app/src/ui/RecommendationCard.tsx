import type { Champion } from '../data/curatedTypes';
import type { Recommendation } from '../engine/recommend';
import { ChampionSquare } from './ChampionSquare';
import { ROLE_LABEL } from './format';

interface Props {
  rec: Recommendation;
  champion: Champion | undefined;
  large: boolean;
  lockLabel: string;
  onLock: (id: number) => void;
}

/** A single scored recommendation with reasons and a lock-in button. */
export function RecommendationCard({ rec, champion, large, lockLabel, onLock }: Props): React.JSX.Element {
  const reasons = large ? rec.reasons.slice(0, 3) : rec.reasons.slice(0, 2);
  return (
    <div className={`rec-card${large ? '' : ' alt'}`}>
      <ChampionSquare champion={champion} size={large ? 96 : 56} />
      <div className="rec-main">
        <div className="rec-title">
          <span className="rec-name" style={large ? undefined : { fontSize: '0.9rem' }}>
            {champion?.name ?? `#${rec.championId}`}
          </span>
          {rec.role && <span className="rec-role">{ROLE_LABEL[rec.role]}</span>}
          <span className="score-badge">{rec.score.toFixed(1)}</span>
        </div>
        <ul className="reasons">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <div className="row">
          <button
            type="button"
            className={large ? 'btn-primary' : ''}
            onClick={() => onLock(rec.championId)}
          >
            {lockLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
