import type { Champion } from '../data/curatedTypes';
import type { TeamComparison, LaneMatchup } from '../engine/compare';
import type { ArchetypeScores } from '../engine/profile';
import { ARCHETYPE_LABEL } from '../engine/profile';
import { ChampionSquare } from './ChampionSquare';
import { ROLE_LABEL } from './format';

interface Props {
  comparison: TeamComparison;
  championMap: Map<number, Champion>;
}

function archChips(scores: ArchetypeScores, side: 'us' | 'them'): React.JSX.Element[] {
  const label = side === 'us' ? 'Us' : 'Them';
  const out: React.JSX.Element[] = [];
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

/** Formats a bar value: whole numbers plain, halves to one decimal. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Edge arrow for a lane matchup. */
function laneArrow(lane: LaneMatchup): string {
  if (lane.edge === 'us') return '◄';
  if (lane.edge === 'them') return '►';
  return '=';
}

/** Renders the full end-of-draft team comparison inside the center column. */
export function TeamComparisonView({ comparison, championMap }: Props): React.JSX.Element {
  const { dimensions, archetypes, lanes, strengths, weaknesses, plan } = comparison;

  return (
    <div className="cmp">
      <div className="cmp-arch chips">
        {archChips(archetypes.us, 'us')}
        {archChips(archetypes.them, 'them')}
      </div>

      <div className="cmp-dims">
        {dimensions.map((d) => {
          const usPct = Math.min(100, (d.us / d.scale) * 100);
          const themPct = Math.min(100, (d.them / d.scale) * 100);
          return (
            <div key={d.key} className="cmp-dim">
              <span className="cmp-val us">{fmt(d.us)}</span>
              <span className="cmp-track left">
                <span className="cmp-fill us" style={{ width: `${usPct}%` }} />
              </span>
              <span className="cmp-dim-label">{d.label}</span>
              <span className="cmp-track right">
                <span className="cmp-fill them" style={{ width: `${themPct}%` }} />
              </span>
              <span className="cmp-val them">{fmt(d.them)}</span>
            </div>
          );
        })}
      </div>

      <div className="cmp-cols">
        <div className="cmp-side">
          <h4 className="cmp-h us">Our strengths</h4>
          <ul className="cmp-list">
            {strengths.us.length ? strengths.us.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">Balanced</li>}
          </ul>
          <h4 className="cmp-h warn">Our weaknesses</h4>
          <ul className="cmp-list">
            {weaknesses.us.length ? weaknesses.us.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">None flagged</li>}
          </ul>
        </div>
        <div className="cmp-side">
          <h4 className="cmp-h them">Their strengths</h4>
          <ul className="cmp-list">
            {strengths.them.length ? strengths.them.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">Balanced</li>}
          </ul>
          <h4 className="cmp-h warn">Their weaknesses</h4>
          <ul className="cmp-list">
            {weaknesses.them.length ? weaknesses.them.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">None flagged</li>}
          </ul>
        </div>
      </div>

      <div className="cmp-lanes">
        {lanes.map((lane) => (
          <div key={lane.role} className={`cmp-lane ${lane.edge}`}>
            <ChampionSquare champion={lane.us ? championMap.get(lane.us) : undefined} size={34} />
            <span className="cmp-lane-role">{ROLE_LABEL[lane.role]}</span>
            <span className={`cmp-lane-edge ${lane.edge}`} title={`strength ${lane.strength}`}>
              {laneArrow(lane)}
            </span>
            <ChampionSquare champion={lane.them ? championMap.get(lane.them) : undefined} size={34} />
            <span className="cmp-lane-reason">{lane.reason ?? (lane.edge === 'even' ? 'Even lane' : '')}</span>
          </div>
        ))}
      </div>

      <div className="cmp-plan">
        <div className="cmp-plan-head">{plan.headline}</div>
        <ul className="cmp-list">
          {plan.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
