import { useState } from 'react';
import type { GameState } from '../types';
import Map from './Map';

interface NationSelectScreenProps {
  gameState: GameState;
  onConfirm: (nationId: string) => void;
  onBack: () => void;
  onRegenerateMap: (islandCount: number) => Promise<void>;
  mapBust: number;
  mapImage: string | null;
}

export default function NationSelectScreen({
  gameState,
  onConfirm,
  onBack,
  onRegenerateMap,
  mapBust,
  mapImage,
}: NationSelectScreenProps) {
  const [hoveredNationId, setHoveredNationId] = useState<string | null>(null);
  const [selectedNationId, setSelectedNationId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [islandCount, setIslandCount] = useState(6);

  const highlightedNationId = hoveredNationId ?? selectedNationId ?? null;

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await onRegenerateMap(islandCount);
      setSelectedNationId(null);
    } catch {
      // regeneration failed — silently handled
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="nation-select">
      <div className="nation-select__sidebar">
        <div className="nation-select__header">
          <div className="nation-select__title">Choose Your Nation</div>
          <div className="nation-select__subtitle">
            {gameState.scenario.meta.name} &mdash; {gameState.scenario.meta.turnLimit} turns
          </div>
        </div>

        <div className="nation-select__list">
          {gameState.nations.map((nation) => {
            const ownedProvinces = gameState.provinces.filter(
              (p) => p.ownerId === nation.id
            );
            const displayNames = ownedProvinces.slice(0, 4).map((p) => p.name);
            const remainder = ownedProvinces.length - displayNames.length;
            const provinceNameText =
              remainder > 0
                ? `${displayNames.join(', ')} …and ${remainder} more`
                : displayNames.join(', ');

            const isSelected = nation.id === selectedNationId;

            return (
              <button
                key={nation.id}
                className={`nation-card${isSelected ? ' nation-card--selected' : ''}`}
                onClick={() => setSelectedNationId(nation.id)}
                onMouseEnter={() => setHoveredNationId(nation.id)}
                onMouseLeave={() => setHoveredNationId(null)}
              >
                <div className="nation-card__header">
                  <div
                    className="nation-card__swatch"
                    style={{ backgroundColor: nation.color }}
                  />
                  <span className="nation-card__name">{nation.name}</span>
                  <span className="nation-card__archetype">{nation.archetype}</span>
                </div>
                <div className="nation-card__province-count">
                  {ownedProvinces.length} {ownedProvinces.length === 1 ? 'province' : 'provinces'}
                </div>
                {ownedProvinces.length > 0 && (
                  <div className="nation-card__province-names">{provinceNameText}</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="nation-select__footer">
          <div className="nation-select__footer-left">
            <button className="nation-select__back" onClick={onBack}>
              Back
            </button>
            <div className="nation-select__island-ctrl">
              <label className="nation-select__island-label">Islands</label>
              <div className="nation-select__island-row">
                <button
                  className="nation-select__island-btn"
                  onClick={() => setIslandCount(Math.max(2, islandCount - 1))}
                  disabled={islandCount <= 2}
                >
                  −
                </button>
                <span className="nation-select__island-val">{islandCount}</span>
                <button
                  className="nation-select__island-btn"
                  onClick={() => setIslandCount(Math.min(10, islandCount + 1))}
                  disabled={islandCount >= 10}
                >
                  +
                </button>
              </div>
            </div>
            <button
              className="nation-select__regen"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? 'Generating…' : '⟳ Generate'}
            </button>
          </div>
          <button
            className="nation-select__confirm"
            disabled={selectedNationId === null}
            onClick={() => selectedNationId && onConfirm(selectedNationId)}
          >
            Play as {selectedNationId
              ? gameState.nations.find((n) => n.id === selectedNationId)?.name
              : '…'}
          </button>
        </div>
      </div>

      <div className="nation-select__map">
        <Map
          provinces={gameState.provinces}
          edges={gameState.edges}
          nations={gameState.nations}
          armies={gameState.armies}
          selectedProvinceId={null}
          highlightedNationId={highlightedNationId}
          mapBust={mapBust}
          mapImage={mapImage}
        />
      </div>
    </div>
  );
}
