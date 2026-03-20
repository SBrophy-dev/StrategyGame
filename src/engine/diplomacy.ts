import type {
  Nation,
  Province,
  Edge,
  Agreement,
  AgreementType,
  War,
  ResourceLedger,
  ResourceType,
} from '../types';

// --- Relation score helpers ---

/**
 * Clamp a relation score to [-100, +100].
 */
export function clampRelation(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/**
 * Apply per-turn relation decay toward 0 for all nation pairs.
 * Returns a new relations map for each nation (immutable update).
 */
export function applyRelationDecay(
  nations: Nation[],
  decayPerTurn: number
): Nation[] {
  return nations.map((nation) => {
    const newRelations: Record<string, number> = {};
    for (const [otherId, score] of Object.entries(nation.relations)) {
      if (score > 0) {
        newRelations[otherId] = Math.max(0, score - decayPerTurn);
      } else if (score < 0) {
        newRelations[otherId] = Math.min(0, score + decayPerTurn);
      } else {
        newRelations[otherId] = 0;
      }
    }
    return { ...nation, relations: newRelations };
  });
}

/**
 * Modify the relation score between two nations.
 * Returns updated copies of both nations.
 */
export function modifyRelation(
  nationA: Nation,
  nationB: Nation,
  delta: number
): [Nation, Nation] {
  const newA = {
    ...nationA,
    relations: {
      ...nationA.relations,
      [nationB.id]: clampRelation((nationA.relations[nationB.id] ?? 0) + delta),
    },
  };
  const newB = {
    ...nationB,
    relations: {
      ...nationB.relations,
      [nationA.id]: clampRelation((nationB.relations[nationA.id] ?? 0) + delta),
    },
  };
  return [newA, newB];
}

// --- Agreement management ---

/**
 * Check whether a nation can declare war on a target.
 * Requires relation < 0 or existing casus belli (war already active counts).
 */
export function canDeclareWar(
  nation: Nation,
  targetId: string,
  wars: War[]
): boolean {
  // Already at war
  const alreadyAtWar = wars.some(
    (w) =>
      (w.aggressorId === nation.id && w.defenderId === targetId) ||
      (w.aggressorId === targetId && w.defenderId === nation.id)
  );
  if (alreadyAtWar) return false;

  const relation = nation.relations[targetId] ?? 0;
  return relation < 0;
}

/**
 * Check whether a nation can propose an alliance with a target.
 * Requires relation > 50.
 */
export function canProposeAlliance(nation: Nation, targetId: string): boolean {
  const relation = nation.relations[targetId] ?? 0;
  return relation > 50;
}

/**
 * Create a new agreement between two nations.
 * Returns updated copies of both nations with the agreement added.
 */
export function createAgreement(
  nationA: Nation,
  nationB: Nation,
  type: AgreementType,
  currentTurn: number,
  duration: number | null
): [Nation, Nation] {
  const expiresOnTurn = duration !== null ? currentTurn + duration : null;

  const agreementForA: Agreement = {
    type,
    partnerNationId: nationB.id,
    startedOnTurn: currentTurn,
    expiresOnTurn,
    active: true,
  };

  const agreementForB: Agreement = {
    type,
    partnerNationId: nationA.id,
    startedOnTurn: currentTurn,
    expiresOnTurn,
    active: true,
  };

  const newA = {
    ...nationA,
    agreements: {
      ...nationA.agreements,
      [nationB.id]: [...(nationA.agreements[nationB.id] ?? []), agreementForA],
    },
  };
  const newB = {
    ...nationB,
    agreements: {
      ...nationB.agreements,
      [nationA.id]: [...(nationB.agreements[nationA.id] ?? []), agreementForB],
    },
  };

  return [newA, newB];
}

/**
 * Break an agreement between two nations.
 * The breaker suffers a relation penalty.
 * Returns updated copies of both nations.
 */
export function breakAgreement(
  breaker: Nation,
  other: Nation,
  agreementType: AgreementType
): [Nation, Nation] {
  const BREAK_PENALTY: Record<AgreementType, number> = {
    NonAggressionPact: -20,
    TradeDeal: -10,
    MilitaryAlliance: -30,
    Vassalage: -25,
  };

  const penalty = BREAK_PENALTY[agreementType];

  // Deactivate the specific agreement for both sides
  const deactivate = (agreements: Agreement[], partnerType: AgreementType): Agreement[] =>
    agreements.map((a) =>
      a.type === partnerType && a.active ? { ...a, active: false } : a
    );

  const updatedBreaker = {
    ...breaker,
    agreements: {
      ...breaker.agreements,
      [other.id]: deactivate(breaker.agreements[other.id] ?? [], agreementType),
    },
  };

  const updatedOther = {
    ...other,
    agreements: {
      ...other.agreements,
      [breaker.id]: deactivate(other.agreements[breaker.id] ?? [], agreementType),
    },
  };

  // Apply relation penalty
  return modifyRelation(updatedBreaker, updatedOther, penalty);
}

/**
 * Expire agreements that have reached their expiration turn.
 * Returns updated nation with expired agreements deactivated.
 */
export function expireAgreements(nation: Nation, currentTurn: number): Nation {
  const newAgreements: Record<string, Agreement[]> = {};

  for (const [partnerId, agreements] of Object.entries(nation.agreements)) {
    newAgreements[partnerId] = agreements.map((a) => {
      if (a.active && a.expiresOnTurn !== null && currentTurn >= a.expiresOnTurn) {
        return { ...a, active: false };
      }
      return a;
    });
  }

  return { ...nation, agreements: newAgreements };
}

/**
 * Check if two nations have an active agreement of a given type.
 */
export function hasActiveAgreement(
  nation: Nation,
  targetId: string,
  type: AgreementType
): boolean {
  const agreements = nation.agreements[targetId] ?? [];
  return agreements.some((a) => a.type === type && a.active);
}

/**
 * Check if two nations are at war.
 */
export function areAtWar(nationAId: string, nationBId: string, wars: War[]): boolean {
  return wars.some(
    (w) =>
      (w.aggressorId === nationAId && w.defenderId === nationBId) ||
      (w.aggressorId === nationBId && w.defenderId === nationAId)
  );
}

// --- Trade surplus exchange (SPEC §8.3) ---

/**
 * Identify a nation's highest-surplus resource for a given turn.
 * Surplus = income − consumption for that resource this turn.
 */
export function getHighestSurplusResource(
  income: ResourceLedger,
  consumption: ResourceLedger
): { resource: ResourceType; amount: number } | null {
  const resources: ResourceType[] = ['gold', 'food', 'production', 'influence', 'manpower'];
  let best: { resource: ResourceType; amount: number } | null = null;

  for (const r of resources) {
    const surplus = income[r] - consumption[r];
    if (surplus > 0 && (best === null || surplus > best.amount)) {
      best = { resource: r, amount: surplus };
    }
  }

  return best;
}

/**
 * Execute trade deal surplus exchange between two nations.
 * Per SPEC §8.3: if surpluses are different resources, exchange them.
 * Returns resource deltas for both nations (what each receives).
 */
export function executeTradeExchange(
  nationAIncome: ResourceLedger,
  nationAConsumption: ResourceLedger,
  nationBIncome: ResourceLedger,
  nationBConsumption: ResourceLedger
): [ResourceLedger, ResourceLedger] {
  const empty: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };
  const deltaA: ResourceLedger = { ...empty };
  const deltaB: ResourceLedger = { ...empty };

  const surplusA = getHighestSurplusResource(nationAIncome, nationAConsumption);
  const surplusB = getHighestSurplusResource(nationBIncome, nationBConsumption);

  if (!surplusA || !surplusB) return [deltaA, deltaB];

  // Only exchange if surpluses are different resources
  if (surplusA.resource !== surplusB.resource) {
    // A receives B's surplus, B receives A's surplus
    deltaA[surplusB.resource] += surplusB.amount;
    deltaB[surplusA.resource] += surplusA.amount;
  }

  return [deltaA, deltaB];
}

// --- Trade route activation / deactivation ---

/**
 * Activate trade routes on shared edges when a Trade Deal is formed.
 * Returns updated edges array.
 */
export function activateTradeRoutes(
  edges: Edge[],
  provinces: Province[],
  nationAId: string,
  nationBId: string
): Edge[] {
  return edges.map((edge) => {
    const source = provinces.find((p) => p.id === edge.sourceId);
    const target = provinces.find((p) => p.id === edge.targetId);
    if (!source || !target) return edge;

    const isShared =
      (source.ownerId === nationAId && target.ownerId === nationBId) ||
      (source.ownerId === nationBId && target.ownerId === nationAId);

    if (isShared && !edge.tradeActive) {
      return { ...edge, tradeActive: true };
    }
    return edge;
  });
}

/**
 * Deactivate trade routes on shared edges when a Trade Deal is broken.
 * Returns updated edges array.
 */
export function deactivateTradeRoutes(
  edges: Edge[],
  provinces: Province[],
  nationAId: string,
  nationBId: string
): Edge[] {
  return edges.map((edge) => {
    const source = provinces.find((p) => p.id === edge.sourceId);
    const target = provinces.find((p) => p.id === edge.targetId);
    if (!source || !target) return edge;

    const isShared =
      (source.ownerId === nationAId && target.ownerId === nationBId) ||
      (source.ownerId === nationBId && target.ownerId === nationAId);

    if (isShared && edge.tradeActive) {
      return { ...edge, tradeActive: false };
    }
    return edge;
  });
}

// --- War creation ---

/**
 * Create a new war between aggressor and defender.
 * Returns the new War object. Caller is responsible for adding to state.
 */
export function createWar(
  aggressorId: string,
  defenderId: string,
  currentTurn: number
): War {
  return { aggressorId, defenderId, startedOnTurn: currentTurn };
}

/**
 * Resolve a peace offer. Both sides must have offered peace on the same turn.
 * Returns the war to remove (or null if peace not mutual).
 */
export function resolvePeace(
  _war: War,
  aggressorOffersPeace: boolean,
  defenderOffersPeace: boolean
): boolean {
  // Peace requires at least one side to offer; the other can accept (also offers)
  // Per CONFLICT_PRIORITY P1: peace offers beat war declarations
  return aggressorOffersPeace && defenderOffersPeace;
}

// --- Alliance auto-join (SPEC §8.2) ---

/**
 * Find nations that should auto-join a war due to Military Alliance.
 * Returns array of nation IDs that should join on the defender's side.
 */
export function getAllianceAutoJoiners(
  defenderId: string,
  aggressorId: string,
  nations: Nation[],
  wars: War[]
): string[] {
  const joiners: string[] = [];

  for (const nation of nations) {
    if (nation.id === defenderId || nation.id === aggressorId) continue;
    if (nation.eliminatedOnTurn !== undefined) continue;

    if (hasActiveAgreement(nation, defenderId, 'MilitaryAlliance')) {
      // Only auto-join if not already at war with the aggressor
      if (!areAtWar(nation.id, aggressorId, wars)) {
        joiners.push(nation.id);
      }
    }
  }

  return joiners;
}

// --- Intel updates from agreements (SPEC §9) ---

/**
 * Update intel tracks based on active agreements.
 * - Military Alliance → Military + Diplomatic tracks Revealed
 * - Trade Deal → Economic track Revealed
 * Returns updated nation.
 */
export function updateIntelFromAgreements(nation: Nation, nations: Nation[]): Nation {
  const newIntelOf = { ...nation.intelOf };

  for (const other of nations) {
    if (other.id === nation.id) continue;

    const currentIntel = newIntelOf[other.id] ?? {
      military: 'Hidden' as const,
      economic: 'Hidden' as const,
      diplomatic: 'Hidden' as const,
      political: 'Hidden' as const,
    };

    let updatedIntel = { ...currentIntel };

    if (hasActiveAgreement(nation, other.id, 'MilitaryAlliance')) {
      updatedIntel = {
        ...updatedIntel,
        military: 'Revealed',
        diplomatic: 'Revealed',
      };
    }

    if (hasActiveAgreement(nation, other.id, 'TradeDeal')) {
      updatedIntel = {
        ...updatedIntel,
        economic: 'Revealed',
      };
    }

    newIntelOf[other.id] = updatedIntel;
  }

  return { ...nation, intelOf: newIntelOf };
}
