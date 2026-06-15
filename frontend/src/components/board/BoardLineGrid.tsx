import { BoardEmptyState } from './BoardIncidentGrid';

export type LineGroup = {
  lineNumber: string;
  count: number;
  urgent: number;
  notTaken: number;
  pending: number;
  machines: string[];
};

interface BoardLineGridProps {
  items: LineGroup[];
  boardModeLabel: string;
}

export default function BoardLineGrid({ items, boardModeLabel }: BoardLineGridProps) {
  if (items.length === 0) {
    return (
      <BoardEmptyState
        boardModeLabel={boardModeLabel}
        title="Aucune ligne à surveiller"
        detail="Le périmètre choisi ne contient pas de cas ouvert."
      />
    );
  }

  return (
    <div className="board-line-grid">
      {items.map((line) => (
        <article
          key={line.lineNumber}
          className={`board-line-card ${line.urgent > 0 ? 'board-line-critical' : ''}`}
        >
          <div>
            <span>Ligne</span>
            <strong>{line.lineNumber}</strong>
          </div>
          <div>
            <span>Ouverts</span>
            <strong>{line.count}</strong>
          </div>
          <div>
            <span>Urgents</span>
            <strong>{line.urgent}</strong>
          </div>
          <div>
            <span>Non pris</span>
            <strong>{line.notTaken}</strong>
          </div>
          <p>{line.machines.join(', ') || 'Aucune machine concernée'}</p>
        </article>
      ))}
    </div>
  );
}
