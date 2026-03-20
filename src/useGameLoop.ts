/**
 * useGameLoop.ts — Custom React hook that manages the full game loop.
 *
 * Responsibilities:
 *   - Holds GameState in React state
 *   - Tracks pending player orders and computes action budget
 *   - Resolves turns (player + NPC orders → resolveOrders)
 *   - Autosaves after each turn
 *   - Provides callbacks for UI components
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { GameState, Order, ActionBudget, GameEvent } from './types';
import { resolveOrders } from './engine/resolution';
import { generateAllNpcOrders } from './ai/npcOrders';
import { autosave } from './persistence';

// ---------------------------------------------------------------------------
// Budget computation from current state + pending orders
// ---------------------------------------------------------------------------

function getOrderCategory(order: Order): 'diplomatic' | 'military' | 'construction' | 'wildcard' {
  switch (order.type) {
    case 'propose_agreement':
    case 'break_agreement':
    case 'declare_war':
    case 'offer_peace':
      return 'diplomatic';
    case 'move_army':
    case 'retreat':
    case 'blockade':
      return 'military';
    case 'upgrade_dev':
    case 'set_focus':
    case 'build_fort':
      return 'construction';
    case 'spy':
    case 'restore_nation':
    case 'hire_mercenaries':
      return 'wildcard';
  }
}

function computeBudget(
  state: GameState,
  playerNationId: string,
  pendingOrders: Order[]
): ActionBudget {
  // Base allocations per §6.3
  const playerArmyCount = state.armies.filter(
    (a) => a.ownerId === playerNationId && a.strength > 0
  ).length;
  const playerProvinceCount = state.provinces.filter(
    (p) => p.ownerId === playerNationId
  ).length;

  const budget: ActionBudget = {
    diplomatic: 2,
    diplomaticUsed: 0,
    military: playerArmyCount,
    militaryUsed: 0,
    construction: playerProvinceCount,
    constructionUsed: 0,
    wildcard: 1,
    wildcardUsed: 0,
  };

  // Count used slots from pending orders
  for (const order of pendingOrders) {
    const cat = getOrderCategory(order);
    switch (cat) {
      case 'diplomatic':
        budget.diplomaticUsed++;
        break;
      case 'military':
        budget.militaryUsed++;
        break;
      case 'construction':
        budget.constructionUsed++;
        break;
      case 'wildcard':
        budget.wildcardUsed++;
        break;
    }
  }

  return budget;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface GameLoopState {
  gameState: GameState;
  pendingOrders: Order[];
  budget: ActionBudget;
  playerNationId: string;
  pendingTurnResult: GameState | null;
  queueOrder: (order: Order) => void;
  removeOrder: (index: number) => void;
  endTurn: () => void;
  commitTurn: () => void;
  setGameState: (state: GameState) => void;
  // Transient UI highlight state — not persisted, overwritten each turn
  recentCaptureIds: Set<string>;
  recentLossIds: Set<string>;
  recentBattleIds: Set<string>;
  mapTransitioning: boolean;
}

// ---------------------------------------------------------------------------
// useGameLoop hook
// ---------------------------------------------------------------------------

export function useGameLoop(
  initialState: GameState,
  eventLibrary: GameEvent[],
  playerNationId: string
): GameLoopState {
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [pendingTurnResult, setPendingTurnResult] = useState<GameState | null>(null);

  // Transient highlight state — derived from province diffs / conflict reports at commitTurn
  const [recentCaptureIds, setRecentCaptureIds] = useState<Set<string>>(new Set());
  const [recentLossIds,    setRecentLossIds]    = useState<Set<string>>(new Set());
  const [recentBattleIds,  setRecentBattleIds]  = useState<Set<string>>(new Set());
  const [mapTransitioning, setMapTransitioning] = useState(false);

  // Auto-clear mapTransitioning after the CSS animation completes (≤400ms)
  useEffect(() => {
    if (!mapTransitioning) return;
    const id = setTimeout(() => setMapTransitioning(false), 400);
    return () => clearTimeout(id);
  }, [mapTransitioning]);

  const budget = useMemo(
    () => computeBudget(gameState, playerNationId, pendingOrders),
    [gameState, playerNationId, pendingOrders]
  );

  const queueOrder = useCallback((order: Order) => {
    setPendingOrders((prev) => [...prev, order]);
  }, []);

  const removeOrder = useCallback((index: number) => {
    setPendingOrders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const endTurn = useCallback(() => {
    if (gameState.gameOver) return;

    // 1. Generate NPC orders for all non-player nations
    const npcOrders = generateAllNpcOrders(gameState, playerNationId);

    // 2. Combine player + NPC orders into the allOrders map
    const allOrders: Record<string, Order[]> = {
      ...npcOrders,
      [playerNationId]: [...pendingOrders],
    };

    // 3. Resolve the turn
    const newState = resolveOrders(gameState, allOrders, eventLibrary);

    // 4. Hold resolved state for the Turn Summary Modal to display.
    //    The map will not update until commitTurn() is called.
    setPendingTurnResult(newState);

    // 5. Autosave immediately so progress is preserved if the tab closes
    //    while the modal is open.
    autosave(newState);
  }, [gameState, pendingOrders, playerNationId, eventLibrary]);

  const commitTurn = useCallback(() => {
    if (!pendingTurnResult) return;

    // ── Province ownership diff (before state swap) ──────────────────────────
    const captures = new Set<string>();
    const losses   = new Set<string>();
    for (const newProv of pendingTurnResult.provinces) {
      const oldProv = gameState.provinces.find((p) => p.id === newProv.id);
      if (!oldProv || oldProv.ownerId === newProv.ownerId) continue;
      if (newProv.ownerId === playerNationId)      captures.add(newProv.id);
      else if (oldProv.ownerId === playerNationId) losses.add(newProv.id);
    }

    // ── Battle locations involving the player ────────────────────────────────
    const lastLog = pendingTurnResult.turnLogs[pendingTurnResult.turnLogs.length - 1];
    const battles = new Set<string>();
    if (lastLog) {
      for (const entry of lastLog.conflictReport.entries) {
        if (
          entry.type === 'battle' &&
          entry.provinceId &&
          entry.involvedNations.includes(playerNationId)
        ) {
          battles.add(entry.provinceId);
        }
      }
    }

    // ── Apply highlights (overwrites previous turn's data) ───────────────────
    setRecentCaptureIds(captures);
    setRecentLossIds(losses);
    setRecentBattleIds(battles);
    setMapTransitioning(true);

    // ── Commit state ─────────────────────────────────────────────────────────
    setGameState(pendingTurnResult);
    setPendingTurnResult(null);
    setPendingOrders([]);
  }, [pendingTurnResult, gameState, playerNationId]);

  return {
    gameState,
    pendingOrders,
    budget,
    playerNationId,
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
  };
}
