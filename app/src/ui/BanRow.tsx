import type { Champion } from '../data/curatedTypes';
import { championIconUrl } from '../data/loadChampions';
import { SKIP_ID } from '../engine/draft';

interface Props {
  team: 'us' | 'them';
  bans: number[];
  championMap: Map<number, Champion>;
  /** Index of the slot being filled now (highlighted), or -1. */
  activeIndex: number;
  onRemove: (index: number) => void;
}

/** A row of five ban squares for one team. */
export function BanRow({ team, bans, championMap, activeIndex, onRemove }: Props): React.JSX.Element {
  return (
    <div className={`ban-row ${team}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const id = bans[i];
        const filled = id !== undefined;
        const champ = id !== undefined && id !== SKIP_ID ? championMap.get(id) : undefined;
        const classes = ['ban-slot'];
        if (!filled) classes.push('empty');
        if (i === activeIndex) classes.push('current');
        return (
          <div key={i} className={classes.join(' ')}>
            {champ && <img src={championIconUrl(champ.alias)} alt={champ.name} title={champ.name} />}
            {filled && id === SKIP_ID && <span className="skip-mark">—</span>}
            {filled && (
              <button
                type="button"
                className="slot-x"
                title="Undo back to here"
                onClick={() => onRemove(i)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
