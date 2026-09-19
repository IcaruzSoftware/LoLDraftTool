import type { Champion } from '../data/curatedTypes';
import { championIconUrl } from '../data/loadChampions';

interface Props {
  champion: Champion | undefined;
  size: number;
  dimmed?: boolean;
  title?: string;
}

/** A champion's square icon at a given size, or an empty framed box. */
export function ChampionSquare({ champion, size, dimmed, title }: Props): React.JSX.Element {
  return (
    <div
      className={`champ-square${dimmed ? ' dim' : ''}`}
      style={{ width: size, height: size }}
      title={title}
    >
      {champion && (
        <img src={championIconUrl(champion.alias)} alt={champion.name} loading="lazy" />
      )}
    </div>
  );
}
