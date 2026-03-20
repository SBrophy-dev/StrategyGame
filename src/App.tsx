import './App.css';
import { useState, useRef, useCallback, useMemo } from 'react';
import Map from './components/Map.tsx';
import TopBar from './components/TopBar.tsx';
import BottomBar from './components/BottomBar.tsx';
import RightPanel from './components/RightPanel.tsx';
import MapLegend from './components/MapLegend.tsx';
import HintsButton from './components/HintsButton.tsx';
import NationOverviewHUD from './components/NationOverviewHUD.tsx';
import NationSelectScreen from './components/NationSelectScreen.tsx';
import TurnSummaryModal from './components/TurnSummaryModal.tsx';
import type { GameState, GameEvent } from './types';
import { validateScenario } from './validateScenario';
import { initializeGameState } from './initGame';
import { loadEventLibrary } from './eventLibrary';
import { useGameLoop } from './useGameLoop';
import {
  hasAutosave,
  loadAutosave,
  exportSave,
  importSave,
  autosave,
} from './persistence';

// Built-in scenario import
import shatteredKingdomsJson from './scenarios/shattered_kingdoms.json';

// ---------------------------------------------------------------------------
// App modes: title screen or in-game
// ---------------------------------------------------------------------------

type AppMode = 'title' | 'select_nation' | 'playing';

// ---------------------------------------------------------------------------
// GameScreen — renders when a game is active
// ---------------------------------------------------------------------------

interface GameScreenProps {
  initialState: GameState;
  eventLibrary: GameEvent[];
  playerNationId: string;
  onExitToTitle: () => void;
}

function GameScreen({ initialState, eventLibrary, playerNationId, onExitToTitle }: GameScreenProps) {
  const {
    gameState,
    pendingOrders,
    budget,
    pendingTurnResult,
    queueOrder,
    removeOrder,
    endTurn,
    commitTurn,
    setGameState,
    recentCaptureIds,
    recentLossIds,
    recentBattleIds,
    mapTransitioning,
  } = useGameLoop(initialState, eventLibrary, playerNationId);

  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playerNation = useMemo(
    () => gameState.nations.find((n) => n.id === playerNationId),
    [gameState.nations, playerNationId]
  );

  const selectedProvince = useMemo(
    () =>
      selectedProvinceId
        ? gameState.provinces.find((p) => p.id === selectedProvinceId) ?? null
        : null,
    [gameState.provinces, selectedProvinceId]
  );

  const winnerName = useMemo(() => {
    if (!gameState.winner) return null;
    return gameState.nations.find((n) => n.id === gameState.winner)?.name ?? gameState.winner;
  }, [gameState.winner, gameState.nations]);

  const handleExportSave = useCallback(() => {
    exportSave(gameState);
  }, [gameState]);

  const handleImportSave = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const loaded = await importSave(file);
        setGameState(loaded);
        autosave(loaded);
      } catch (err) {
        alert(`Failed to load save: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [setGameState]
  );

  return (
    <div className="app-layout">
      <TopBar
        turn={gameState.turn}
        turnLimit={gameState.scenario.meta.turnLimit}
        resources={
          playerNation?.resources ?? {
            gold: 0,
            food: 0,
            production: 0,
            influence: 0,
            manpower: 0,
          }
        }
        playerNationName={playerNation?.name ?? ''}
        gameOver={gameState.gameOver}
        winner={winnerName}
        onEndTurn={endTurn}
        onExportSave={handleExportSave}
        onImportSave={handleImportSave}
        onExitToMenu={onExitToTitle}
      />

      <NationOverviewHUD
        gameState={gameState}
        playerNationId={playerNationId}
        visible={hudVisible}
        onToggle={() => setHudVisible((v) => !v)}
      />

      <div className={`map-area${mapTransitioning ? ' map-area--transitioning' : ''}`}>
        <Map
          provinces={gameState.provinces}
          edges={gameState.edges}
          nations={gameState.nations}
          armies={gameState.armies}
          selectedProvinceId={selectedProvinceId}
          onProvinceClick={setSelectedProvinceId}
          recentCaptureIds={recentCaptureIds}
          recentLossIds={recentLossIds}
          recentBattleIds={recentBattleIds}
        />

        <MapLegend />

        <HintsButton />

        {selectedProvince && (
          <RightPanel
            province={selectedProvince}
            nations={gameState.nations}
            armies={gameState.armies}
            edges={gameState.edges}
            playerNationId={playerNationId}
            budget={budget}
            scenario={gameState.scenario}
            onClose={() => setSelectedProvinceId(null)}
            onQueueOrder={queueOrder}
          />
        )}

        {pendingTurnResult && (
          <TurnSummaryModal
            newState={pendingTurnResult}
            playerNationId={playerNationId}
            onClose={commitTurn}
          />
        )}
      </div>

      <BottomBar
        orders={pendingOrders}
        budget={budget}
        nations={gameState.nations}
        onRemoveOrder={removeOrder}
        onEndTurn={endTurn}
        gameOver={gameState.gameOver}
      />

      {/* Hidden file input for import — triggered by TopBar Import Save button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TitleScreen — scenario selection + continue
// ---------------------------------------------------------------------------

interface TitleScreenProps {
  onStartNew: () => void;
  onContinue: () => void;
  hasSavedGame: boolean;
}

function TitleScreen({ onStartNew, onContinue, hasSavedGame }: TitleScreenProps) {
  return (
    <div className="title-screen">
      <div className="title-screen__content">
        <h1 className="title-screen__title">Pax Historia</h1>
        <p className="title-screen__subtitle">A Grand Strategy Game</p>

        <div className="title-screen__actions">
          <button className="title-screen__btn title-screen__btn--primary" onClick={onStartNew}>
            New Game &mdash; The Shattered Kingdoms
          </button>

          {hasSavedGame && (
            <button className="title-screen__btn" onClick={onContinue}>
              Continue Saved Game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export default function App() {
  const [mode, setMode] = useState<AppMode>('title');
  const [activeGame, setActiveGame] = useState<{
    state: GameState;
    eventLibrary: GameEvent[];
    playerNationId: string;
  } | null>(null);
  const [pendingGame, setPendingGame] = useState<{
    state: GameState;
    eventLibrary: GameEvent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartNew = useCallback(() => {
    try {
      const scenario = validateScenario(shatteredKingdomsJson);
      const gameState = initializeGameState(scenario);
      const eventLib = loadEventLibrary(
        scenario.genericEvents,
        scenario.scriptedEvents
      );

      setPendingGame({ state: gameState, eventLibrary: eventLib });
      setMode('select_nation');
      setError(null);
    } catch (err) {
      setError(
        `Failed to start game: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }, []);

  const handleNationConfirm = useCallback((nationId: string) => {
    if (!pendingGame) return;
    autosave(pendingGame.state);
    setActiveGame({ state: pendingGame.state, eventLibrary: pendingGame.eventLibrary, playerNationId: nationId });
    setPendingGame(null);
    setMode('playing');
  }, [pendingGame]);

  const handleNationBack = useCallback(() => {
    setPendingGame(null);
    setMode('title');
  }, []);

  const handleContinue = useCallback(() => {
    try {
      const savedState = loadAutosave();
      if (!savedState) {
        setError('No saved game found.');
        return;
      }

      const eventLib = loadEventLibrary(
        savedState.scenario.genericEvents,
        savedState.scenario.scriptedEvents
      );

      // TODO: playerNationId is not persisted in SaveEnvelope — loaded games always
      // default to nations[0]. Fix in a follow-up phase by storing playerNationId
      // in the save envelope and reading it back here.
      const playerNationId = savedState.scenario.nations[0].id;

      setActiveGame({ state: savedState, eventLibrary: eventLib, playerNationId });
      setMode('playing');
      setError(null);
    } catch (err) {
      setError(
        `Failed to load save: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }, []);

  const handleExitToTitle = useCallback(() => {
    setActiveGame(null);
    setMode('title');
  }, []);

  // --- Nation selection ---
  if (mode === 'select_nation' && pendingGame) {
    return (
      <NationSelectScreen
        gameState={pendingGame.state}
        onConfirm={handleNationConfirm}
        onBack={handleNationBack}
      />
    );
  }

  // --- Error display ---
  if (error) {
    return (
      <div className="app-layout" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
      }}>
        <span style={{ color: 'var(--danger)', fontSize: '16px' }}>{error}</span>
        <button
          className="title-screen__btn"
          onClick={() => setError(null)}
        >
          Back
        </button>
      </div>
    );
  }

  // --- Title screen ---
  if (mode === 'title' || !activeGame) {
    return (
      <TitleScreen
        onStartNew={handleStartNew}
        onContinue={handleContinue}
        hasSavedGame={hasAutosave()}
      />
    );
  }

  // --- Active game ---
  return (
    <GameScreen
      key={activeGame.state.turn + '-' + activeGame.state.scenario.meta.id}
      initialState={activeGame.state}
      eventLibrary={activeGame.eventLibrary}
      playerNationId={activeGame.playerNationId}
      onExitToTitle={handleExitToTitle}
    />
  );
}
