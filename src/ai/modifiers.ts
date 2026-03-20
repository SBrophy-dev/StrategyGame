import type { GameContext } from '../types';

// ---------------------------------------------------------------------------
// Modifier pure functions (Convention #8: pure functions ONLY, no constants)
// ---------------------------------------------------------------------------
// Each modifier: (score: number, context: GameContext) => number
// Applied selectively by npcOrders.ts based on action category.
// ---------------------------------------------------------------------------

/**
 * Get IDs of nations that own provinces adjacent to the current nation's territory.
 */
function getNeighborNationIds(context: GameContext): string[] {
  const { state, currentNationId } = context;
  const ownedIds = new Set(
    state.provinces.filter((p) => p.ownerId === currentNationId).map((p) => p.id)
  );
  const neighborIds = new Set<string>();
  for (const edge of state.edges) {
    if (ownedIds.has(edge.sourceId)) {
      const target = state.provinces.find((p) => p.id === edge.targetId);
      if (target?.ownerId && target.ownerId !== currentNationId && target.ownerId !== 'rebel') {
        neighborIds.add(target.ownerId);
      }
    }
    if (ownedIds.has(edge.targetId)) {
      const source = state.provinces.find((p) => p.id === edge.sourceId);
      if (source?.ownerId && source.ownerId !== currentNationId && source.ownerId !== 'rebel') {
        neighborIds.add(source.ownerId);
      }
    }
  }
  return [...neighborIds];
}

/**
 * Opportunist — boosts utility score when a neighbor is weakened or at war.
 * Returns score × 1.5 if any neighbor is at war with a third party or has low manpower.
 */
export function opportunist(score: number, context: GameContext): number {
  const { state, currentNationId } = context;
  const neighborIds = getNeighborNationIds(context);

  for (const neighborId of neighborIds) {
    const neighbor = state.nations.find((n) => n.id === neighborId);
    if (!neighbor) continue;

    // Neighbor at war with someone other than us
    const atWarWithThirdParty = state.wars.some(
      (w) =>
        (w.aggressorId === neighborId || w.defenderId === neighborId) &&
        w.aggressorId !== currentNationId &&
        w.defenderId !== currentNationId
    );

    // Neighbor has low manpower (< 15)
    const isWeak = neighbor.resources.manpower < 15;

    if (atWarWithThirdParty || isWeak) {
      return score * 1.5;
    }
  }

  return score;
}

/**
 * Paranoid — inflates perceived threat from adjacent nations; prefers defensive agreements.
 * Returns score × 1.4 if any neighbor has significantly higher military strength.
 */
export function paranoid(score: number, context: GameContext): number {
  const { state, currentNationId } = context;
  const neighborIds = getNeighborNationIds(context);

  const ownStrength = state.armies
    .filter((a) => a.ownerId === currentNationId)
    .reduce((sum, a) => sum + a.strength, 0);

  for (const neighborId of neighborIds) {
    const neighborStrength = state.armies
      .filter((a) => a.ownerId === neighborId)
      .reduce((sum, a) => sum + a.strength, 0);

    // Neighbor has 50%+ more military strength
    if (neighborStrength > ownStrength * 1.5) {
      return score * 1.4;
    }
  }

  return score;
}

/**
 * Honorable — reduces likelihood of breaking agreements; penalty to betrayal actions.
 * Returns score × 0.3 (heavy penalty for dishonorable actions).
 * Should be applied only to agreement-breaking and war-declaration actions.
 */
export function honorable(score: number, _context: GameContext): number {
  return score * 0.3;
}

/**
 * NavalFocus — multiplies utility for actions involving Naval armies and coastal provinces.
 * Returns score × 1.5.
 * Should be applied only to naval-related actions.
 */
export function navalFocus(score: number, _context: GameContext): number {
  return score * 1.5;
}

/**
 * Grudgeholder — relation recovery toward nations that attacked them is slower.
 * Returns score × 0.4 for peace/positive diplomatic actions toward past aggressors.
 * Should be applied to peace offers and positive diplomatic actions toward aggressors.
 */
export function grudgeholder(score: number, context: GameContext): number {
  const { state, currentNationId } = context;

  // Check if we were attacked by any nation (they declared war on us)
  const hasAggressors = state.wars.some((w) => w.defenderId === currentNationId);

  if (hasAggressors) {
    return score * 0.4;
  }

  return score;
}

/**
 * Militarist — bonus to utility for any military action regardless of archetype.
 * Returns score × 1.3.
 * Should be applied to all military-category actions.
 */
export function militarist(score: number, _context: GameContext): number {
  return score * 1.3;
}

// ---------------------------------------------------------------------------
// Modifier lookup map — used by npcOrders.ts to apply modifiers by name
// ---------------------------------------------------------------------------

export const MODIFIER_FNS: Record<string, (score: number, context: GameContext) => number> = {
  Opportunist: opportunist,
  Paranoid: paranoid,
  Honorable: honorable,
  NavalFocus: navalFocus,
  Grudgeholder: grudgeholder,
  Militarist: militarist,
};
