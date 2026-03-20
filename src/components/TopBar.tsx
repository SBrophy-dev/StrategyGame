import type { ResourceLedger } from '../types';

export interface TopBarProps {
  turn: number;
  turnLimit: number;
  resources: ResourceLedger;
  playerNationName: string;
  gameOver: boolean;
  winner: string | null;
  onEndTurn: () => void;
  onExportSave: () => void;
  onImportSave: () => void;
  onExitToMenu: () => void;
}

export default function TopBar({
  turn,
  turnLimit,
  resources,
  playerNationName,
  gameOver,
  winner,
  onEndTurn,
  onExportSave,
  onImportSave,
  onExitToMenu,
}: TopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar__turn">
        Turn {turn} / {turnLimit} &mdash; {playerNationName}
      </div>

      {gameOver ? (
        <div className="topbar__game-over">
          <span className="topbar__game-over-label">
            {winner ? `Winner: ${winner}` : 'Game Over'}
          </span>
        </div>
      ) : (
        <div className="topbar__resources">
          <span className="topbar__resource topbar__resource--gold">
            <span className="topbar__resource-icon" />
            <span className="topbar__resource-icon-label">{'\u2B21'}</span>
            {resources.gold}
          </span>
          <span className="topbar__resource topbar__resource--food">
            <span className="topbar__resource-icon" />
            <span className="topbar__resource-icon-label">{'\u274B'}</span>
            {resources.food}
          </span>
          <span className="topbar__resource topbar__resource--production">
            <span className="topbar__resource-icon" />
            <span className="topbar__resource-icon-label">{'\u2692'}</span>
            {resources.production}
          </span>
          <span className="topbar__resource topbar__resource--manpower">
            <span className="topbar__resource-icon" />
            <span className="topbar__resource-icon-label">{'\u2694'}</span>
            {resources.manpower}
          </span>
          <span className="topbar__resource topbar__resource--influence">
            <span className="topbar__resource-icon" />
            <span className="topbar__resource-icon-label">{'\u2726'}</span>
            {resources.influence}
          </span>
        </div>
      )}

      <div className="topbar__toolbar">
        {!gameOver && (
          <button className="topbar__end-turn" onClick={onEndTurn}>
            END TURN
          </button>
        )}
        <button className="topbar__toolbar-btn" onClick={onExportSave}>
          Export Save
        </button>
        <button className="topbar__toolbar-btn" onClick={onImportSave}>
          Import Save
        </button>
        <button className="topbar__toolbar-btn topbar__toolbar-btn--danger" onClick={onExitToMenu}>
          Exit
        </button>
      </div>
    </div>
  );
}
