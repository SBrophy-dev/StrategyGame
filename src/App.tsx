import './App.css';
import { useState, useRef, useCallback, useMemo } from 'react';
import Map from './components/Map.tsx';
import TopBar from './components/TopBar.tsx';
import BottomBar from './components/BottomBar.tsx';
import RightPanel from './components/RightPanel.tsx';
import MapLegend from './components/MapLegend.tsx';
import HintsButton from './components/HintsButton.tsx';
import SuggestionsButton from './components/SuggestionsButton.tsx';
import NationOverviewHUD from './components/NationOverviewHUD.tsx';
import NationSelectScreen from './components/NationSelectScreen.tsx';
import TurnSummaryModal from './components/TurnSummaryModal.tsx';
import Logo from './components/Logo.tsx';
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
        <div className="map-frame">
          <div className="map-frame__corner map-frame__corner--tl" />
          <div className="map-frame__corner map-frame__corner--tr" />
          <div className="map-frame__corner map-frame__corner--br" />
          <div className="map-frame__corner map-frame__corner--bl" />
          <div className="map-frame__surface">
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
          </div>
        </div>

        <MapLegend />

        <HintsButton />

        <SuggestionsButton
          gameState={gameState}
          playerNationId={playerNationId}
          budget={budget}
        />

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
      {/* Animated particle background */}
      <div className="title-screen__particles">
        {Array.from({ length: 60 }, (_, i) => (
          <div
            key={i}
            className="title-screen__particle"
            style={{
              left: `${(i * 13 + 5) % 100}%`,
              top: `${(i * 11 + 3) % 100}%`,
              animationDelay: `${(i * 0.5) % 6}s`,
              animationDuration: `${6 + (i * 0.7) % 8}s`,
              opacity: 0.1 + ((i * 5) % 8) * 0.02,
              width: `${1.5 + (i % 3)}px`,
              height: `${1.5 + (i % 3)}px`,
            }}
          />
        ))}
      </div>

      {/* Illustrated landscape silhouette banner */}
      <svg className="title-screen__banner" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="banner-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(14,21,34,0)" />
            <stop offset="40%" stopColor="rgba(14,21,34,0.6)" />
            <stop offset="100%" stopColor="rgba(6,8,14,1)" />
          </linearGradient>
        </defs>
        {/* Mountain range */}
        <path
          d="M0 200 L0 140 L60 100 L120 130 L180 70 L240 110 L300 50 L360 90 L420 60 L480 100 L540 40 L600 80 L660 55 L720 95 L780 45 L840 85 L900 65 L960 110 L1020 75 L1080 105 L1140 80 L1200 120 L1200 200 Z"
          fill="rgba(18,28,42,0.5)"
        />
        {/* Castle silhouette */}
        <g transform="translate(520, 60)" fill="rgba(12,18,30,0.7)">
          <rect x="0" y="40" width="160" height="80" />
          <rect x="10" y="20" width="20" height="60" />
          <rect x="50" y="10" width="20" height="70" />
          <rect x="90" y="0" width="20" height="80" />
          <rect x="130" y="20" width="20" height="60" />
          {/* Battlements */}
          <rect x="5" y="14" width="6" height="8" />
          <rect x="19" y="14" width="6" height="8" />
          <rect x="45" y="4" width="6" height="8" />
          <rect x="59" y="4" width="6" height="8" />
          <rect x="85" y="-6" width="6" height="8" />
          <rect x="99" y="-6" width="6" height="8" />
          <rect x="125" y="14" width="6" height="8" />
          <rect x="139" y="14" width="6" height="8" />
          {/* Windows */}
          <rect x="65" y="55" width="10" height="14" rx="5" fill="rgba(255,200,69,0.15)" />
          <rect x="105" y="45" width="10" height="14" rx="5" fill="rgba(255,200,69,0.1)" />
        </g>
        {/* Trees (left) */}
        <g transform="translate(200, 100)" fill="rgba(12,18,30,0.6)">
          <polygon points="0,40 10,0 20,40" />
          <polygon points="30,50 42,15 54,50" />
          <polygon points="55,45 65,10 75,45" />
        </g>
        {/* Trees (right) */}
        <g transform="translate(850, 95)" fill="rgba(12,18,30,0.6)">
          <polygon points="0,40 10,0 20,40" />
          <polygon points="25,45 35,10 45,45" />
          <polygon points="50,50 62,15 74,50" />
        </g>
        {/* Gradient overlay for smooth fade */}
        <rect x="0" y="0" width="1200" height="200" fill="url(#banner-grad)" />
      </svg>

      {/* Main content */}
      <div className="title-screen__content">
        <div className="title-screen__logo-wrap">
          <Logo width={320} showTitle={true} />
        </div>

        <p className="title-screen__tagline">Forge Your Legacy in a World of Conflict</p>

        <div className="title-screen__description">
          <h3>About Realms of Iron</h3>
          <p>
            Realms of Iron is a grand strategy game where you lead a nation to glory through 
            careful diplomacy, economic management, and military conquest. Set in a fractured 
            continent where ancient empires have fallen, you must navigate the complex web of 
            alliances, betrayals, and warfare to emerge victorious.
          </p>
          
          <h3>How to Play</h3>
          <ul className="title-screen__features">
            <li>🎯 Choose your nation from 10 unique factions, each with special abilities</li>
            <li>🏛️ Manage your provinces - develop infrastructure, set economic focus, and build fortifications</li>
            <li>⚔️ Engage in diplomacy - form alliances, negotiate trade deals, and declare wars</li>
            <li>🗡️ Command your armies - move troops, besiege enemy strongholds, and win battles</li>
            <li>📊 Monitor your resources - balance gold, food, production, manpower, and influence</li>
            <li>🎲 Experience dynamic events - from natural disasters to royal successions</li>
          </ul>
        </div>

        <div className="title-screen__actions">
          <button className="title-screen__btn title-screen__btn--primary" onClick={onStartNew}>
            New Game &mdash; The Shattered Kingdoms
          </button>

          {hasSavedGame && (
            <button className="title-screen__btn" onClick={onContinue}>
              Continue Saved Game
            </button>
          )}
          
          <button className="title-screen__btn title-screen__btn--secondary" onClick={() => alert('Coming soon: Detailed tutorial and gameplay guide!')}>
            How to Play
          </button>
        </div>

        <p className="title-screen__version">v1.0</p>
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
  const [mapBust, setMapBust] = useState(0);
  const [mapImageOverride, setMapImageOverride] = useState<string | null>(null);

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

  const handleRegenerateMap = useCallback(async (islandCount: number) => {
    if (!pendingGame) return;
    const res = await fetch(`/api/regenerate-map?islands=${islandCount}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to regenerate map');

    if (data.image) setMapImageOverride(data.image);

    const baseScenario = validateScenario(shatteredKingdomsJson);
    const updatedScenario = {
      ...baseScenario,
      world: { ...baseScenario.world, provinces: data.provinces },
    };
    const gameState = initializeGameState(updatedScenario);
    const eventLib = loadEventLibrary(updatedScenario.genericEvents, updatedScenario.scriptedEvents);
    setPendingGame({ state: gameState, eventLibrary: eventLib });
    setMapBust(Date.now());
  }, [pendingGame]);

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
        onRegenerateMap={handleRegenerateMap}
        mapBust={mapBust}
        mapImage={mapImageOverride}
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
