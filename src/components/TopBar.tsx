import type { ResourceLedger } from '../types';
import GameIcon from './GameIcon';

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
             <GameIcon name="gold" size={16} title="Gold" className="topbar__resource-icon-label" />
             {resources.gold}
           </span>
           <span className="topbar__resource topbar__resource--food">
             <span className="topbar__resource-icon" />
             <GameIcon name="food" size={16} title="Food" className="topbar__resource-icon-label" />
             {resources.food}
           </span>
           <span className="topbar__resource topbar__resource--production">
             <span className="topbar__resource-icon" />
             <GameIcon name="production" size={16} title="Production" className="topbar__resource-icon-label" />
             {resources.production}
           </span>
           <span className="topbar__resource topbar__resource--manpower">
             <span className="topbar__resource-icon" />
             <GameIcon name="manpower" size={16} title="Manpower" className="topbar__resource-icon-label" />
             {resources.manpower}
           </span>
           <span className="topbar__resource topbar__resource--influence">
             <span className="topbar__resource-icon" />
             <GameIcon name="influence" size={16} title="Influence" className="topbar__resource-icon-label" />
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
