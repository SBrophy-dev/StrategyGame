import { describe, it, expect } from 'vitest';
import {
  clampRelation,
  applyRelationDecay,
  modifyRelation,
  canDeclareWar,
  canProposeAlliance,
  createAgreement,
  breakAgreement,
  expireAgreements,
  hasActiveAgreement,
  areAtWar,
  getHighestSurplusResource,
  executeTradeExchange,
  activateTradeRoutes,
  deactivateTradeRoutes,
  createWar,
  resolvePeace,
  getAllianceAutoJoiners,
  updateIntelFromAgreements,
} from './diplomacy';
import type { Nation, Province, Edge, War, ResourceLedger } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNation(overrides: Partial<Nation> = {}): Nation {
  return {
    id: 'n1',
    name: 'Nation 1',
    color: '#ff0000',
    archetype: 'Expansionist',
    modifiers: [],
    agenda: { type: 'military_supremacy', priority: 'medium' },
    utilityWeights: {
      militaryAction: 0.9, territoryGain: 1.0, tradeDeal: 0.3,
      economicDev: 0.4, influenceGain: 0.2, defensivePosture: 0.3,
      allianceBuilding: 0.2, vassalage: 0.1, navalAction: 0.2,
    },
    resources: { gold: 100, food: 50, production: 50, influence: 30, manpower: 40 },
    relations: {},
    agreements: {},
    intelOf: {},
    ...overrides,
  };
}

function makeProvince(overrides: Partial<Province> = {}): Province {
  return {
    id: 'p1',
    name: 'Province',
    ownerId: 'n1',
    terrain: 'Plains',
    devLevel: 1,
    focus: null,
    unrest: 0,
    fortLevel: 0,
    population: 'Medium',
    strategicTag: null,
    layout: { x: 0, y: 0, polygon: [[0, 0], [1, 0], [0, 1]] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// clampRelation
// ---------------------------------------------------------------------------

describe('clampRelation', () => {
  it('clamps positive values to 100', () => {
    expect(clampRelation(150)).toBe(100);
  });

  it('clamps negative values to -100', () => {
    expect(clampRelation(-200)).toBe(-100);
  });

  it('returns value unchanged when within range', () => {
    expect(clampRelation(50)).toBe(50);
    expect(clampRelation(-50)).toBe(-50);
    expect(clampRelation(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyRelationDecay
// ---------------------------------------------------------------------------

describe('applyRelationDecay', () => {
  it('decays positive relations toward 0', () => {
    const nations = [makeNation({ id: 'n1', relations: { n2: 10 } })];
    const result = applyRelationDecay(nations, 3);
    expect(result[0].relations.n2).toBe(7);
  });

  it('decays negative relations toward 0', () => {
    const nations = [makeNation({ id: 'n1', relations: { n2: -10 } })];
    const result = applyRelationDecay(nations, 3);
    expect(result[0].relations.n2).toBe(-7);
  });

  it('does not overshoot past 0', () => {
    const nations = [makeNation({ id: 'n1', relations: { n2: 2 } })];
    const result = applyRelationDecay(nations, 5);
    expect(result[0].relations.n2).toBe(0);
  });

  it('leaves 0 relations unchanged', () => {
    const nations = [makeNation({ id: 'n1', relations: { n2: 0 } })];
    const result = applyRelationDecay(nations, 5);
    expect(result[0].relations.n2).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// modifyRelation
// ---------------------------------------------------------------------------

describe('modifyRelation', () => {
  it('modifies relation bidirectionally', () => {
    const a = makeNation({ id: 'n1', relations: { n2: 0 } });
    const b = makeNation({ id: 'n2', relations: { n1: 0 } });
    const [updA, updB] = modifyRelation(a, b, 25);
    expect(updA.relations.n2).toBe(25);
    expect(updB.relations.n1).toBe(25);
  });

  it('clamps at boundaries', () => {
    const a = makeNation({ id: 'n1', relations: { n2: 90 } });
    const b = makeNation({ id: 'n2', relations: { n1: 90 } });
    const [updA, updB] = modifyRelation(a, b, 20);
    expect(updA.relations.n2).toBe(100);
    expect(updB.relations.n1).toBe(100);
  });

  it('handles negative deltas', () => {
    const a = makeNation({ id: 'n1', relations: { n2: -80 } });
    const b = makeNation({ id: 'n2', relations: { n1: -80 } });
    const [updA, updB] = modifyRelation(a, b, -30);
    expect(updA.relations.n2).toBe(-100);
    expect(updB.relations.n1).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// canDeclareWar / canProposeAlliance
// ---------------------------------------------------------------------------

describe('canDeclareWar', () => {
  it('returns true when relation < 0 and not already at war', () => {
    const nation = makeNation({ relations: { n2: -10 } });
    expect(canDeclareWar(nation, 'n2', [])).toBe(true);
  });

  it('returns false when relation >= 0', () => {
    const nation = makeNation({ relations: { n2: 0 } });
    expect(canDeclareWar(nation, 'n2', [])).toBe(false);
  });

  it('returns false when already at war', () => {
    const nation = makeNation({ relations: { n2: -50 } });
    const wars: War[] = [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }];
    expect(canDeclareWar(nation, 'n2', wars)).toBe(false);
  });
});

describe('canProposeAlliance', () => {
  it('returns true when relation > 50', () => {
    const nation = makeNation({ relations: { n2: 60 } });
    expect(canProposeAlliance(nation, 'n2')).toBe(true);
  });

  it('returns false when relation <= 50', () => {
    const nation = makeNation({ relations: { n2: 50 } });
    expect(canProposeAlliance(nation, 'n2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createAgreement / breakAgreement / expireAgreements / hasActiveAgreement
// ---------------------------------------------------------------------------

describe('createAgreement', () => {
  it('adds active agreement to both nations', () => {
    const a = makeNation({ id: 'n1' });
    const b = makeNation({ id: 'n2' });
    const [updA, updB] = createAgreement(a, b, 'TradeDeal', 5, 10);

    expect(updA.agreements.n2).toHaveLength(1);
    expect(updA.agreements.n2[0].type).toBe('TradeDeal');
    expect(updA.agreements.n2[0].active).toBe(true);
    expect(updA.agreements.n2[0].startedOnTurn).toBe(5);
    expect(updA.agreements.n2[0].expiresOnTurn).toBe(15);

    expect(updB.agreements.n1).toHaveLength(1);
    expect(updB.agreements.n1[0].partnerNationId).toBe('n1');
  });

  it('sets expiresOnTurn to null for indefinite duration', () => {
    const a = makeNation({ id: 'n1' });
    const b = makeNation({ id: 'n2' });
    const [updA] = createAgreement(a, b, 'MilitaryAlliance', 1, null);
    expect(updA.agreements.n2[0].expiresOnTurn).toBeNull();
  });
});

describe('breakAgreement', () => {
  it('deactivates the agreement and applies relation penalty', () => {
    const a = makeNation({
      id: 'n1',
      relations: { n2: 50 },
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const b = makeNation({
      id: 'n2',
      relations: { n1: 50 },
      agreements: {
        n1: [{ type: 'TradeDeal', partnerNationId: 'n1', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const [updA, updB] = breakAgreement(a, b, 'TradeDeal');

    expect(updA.agreements.n2[0].active).toBe(false);
    expect(updB.agreements.n1[0].active).toBe(false);
    // TradeDeal break penalty is -10
    expect(updA.relations.n2).toBe(40);
    expect(updB.relations.n1).toBe(40);
  });

  it('applies correct penalty for MilitaryAlliance break (-30)', () => {
    const a = makeNation({
      id: 'n1',
      relations: { n2: 80 },
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const b = makeNation({
      id: 'n2',
      relations: { n1: 80 },
      agreements: {
        n1: [{ type: 'MilitaryAlliance', partnerNationId: 'n1', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const [updA] = breakAgreement(a, b, 'MilitaryAlliance');
    expect(updA.relations.n2).toBe(50); // 80 - 30
  });
});

describe('expireAgreements', () => {
  it('deactivates agreements at or past expiration turn', () => {
    const nation = makeNation({
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: 5, active: true }],
      },
    });
    const result = expireAgreements(nation, 5);
    expect(result.agreements.n2[0].active).toBe(false);
  });

  it('does not expire agreements before their expiration', () => {
    const nation = makeNation({
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: 10, active: true }],
      },
    });
    const result = expireAgreements(nation, 5);
    expect(result.agreements.n2[0].active).toBe(true);
  });

  it('does not expire indefinite agreements', () => {
    const nation = makeNation({
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const result = expireAgreements(nation, 100);
    expect(result.agreements.n2[0].active).toBe(true);
  });
});

describe('hasActiveAgreement', () => {
  it('returns true for active agreement of matching type', () => {
    const nation = makeNation({
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    expect(hasActiveAgreement(nation, 'n2', 'TradeDeal')).toBe(true);
  });

  it('returns false for inactive agreement', () => {
    const nation = makeNation({
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: false }],
      },
    });
    expect(hasActiveAgreement(nation, 'n2', 'TradeDeal')).toBe(false);
  });

  it('returns false for wrong agreement type', () => {
    const nation = makeNation({
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    expect(hasActiveAgreement(nation, 'n2', 'MilitaryAlliance')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areAtWar / createWar / resolvePeace
// ---------------------------------------------------------------------------

describe('areAtWar', () => {
  it('returns true when nations are at war (either direction)', () => {
    const wars: War[] = [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }];
    expect(areAtWar('n1', 'n2', wars)).toBe(true);
    expect(areAtWar('n2', 'n1', wars)).toBe(true);
  });

  it('returns false when not at war', () => {
    expect(areAtWar('n1', 'n2', [])).toBe(false);
  });
});

describe('createWar', () => {
  it('creates a war object with correct fields', () => {
    const war = createWar('n1', 'n2', 5);
    expect(war.aggressorId).toBe('n1');
    expect(war.defenderId).toBe('n2');
    expect(war.startedOnTurn).toBe(5);
  });
});

describe('resolvePeace', () => {
  it('returns true when both sides offer peace', () => {
    const war: War = { aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 };
    expect(resolvePeace(war, true, true)).toBe(true);
  });

  it('returns false when only one side offers peace', () => {
    const war: War = { aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 };
    expect(resolvePeace(war, true, false)).toBe(false);
    expect(resolvePeace(war, false, true)).toBe(false);
  });

  it('returns false when neither side offers peace', () => {
    const war: War = { aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 };
    expect(resolvePeace(war, false, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trade surplus exchange
// ---------------------------------------------------------------------------

describe('getHighestSurplusResource', () => {
  it('returns the resource with the highest surplus', () => {
    const income: ResourceLedger = { gold: 10, food: 20, production: 5, influence: 0, manpower: 0 };
    const consumption: ResourceLedger = { gold: 5, food: 5, production: 5, influence: 0, manpower: 0 };
    const result = getHighestSurplusResource(income, consumption);
    expect(result).toEqual({ resource: 'food', amount: 15 });
  });

  it('returns null when no resource has surplus', () => {
    const income: ResourceLedger = { gold: 5, food: 5, production: 5, influence: 0, manpower: 0 };
    const consumption: ResourceLedger = { gold: 10, food: 10, production: 10, influence: 0, manpower: 0 };
    expect(getHighestSurplusResource(income, consumption)).toBeNull();
  });
});

describe('executeTradeExchange', () => {
  it('exchanges different surplus resources', () => {
    const aIncome: ResourceLedger = { gold: 20, food: 0, production: 0, influence: 0, manpower: 0 };
    const aCons: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };
    const bIncome: ResourceLedger = { gold: 0, food: 15, production: 0, influence: 0, manpower: 0 };
    const bCons: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };

    const [deltaA, deltaB] = executeTradeExchange(aIncome, aCons, bIncome, bCons);
    expect(deltaA.food).toBe(15); // A receives B's food surplus
    expect(deltaB.gold).toBe(20); // B receives A's gold surplus
  });

  it('does not exchange when surpluses are the same resource', () => {
    const aIncome: ResourceLedger = { gold: 20, food: 0, production: 0, influence: 0, manpower: 0 };
    const aCons: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };
    const bIncome: ResourceLedger = { gold: 15, food: 0, production: 0, influence: 0, manpower: 0 };
    const bCons: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };

    const [deltaA, deltaB] = executeTradeExchange(aIncome, aCons, bIncome, bCons);
    expect(deltaA.gold).toBe(0);
    expect(deltaB.gold).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Trade route activation / deactivation
// ---------------------------------------------------------------------------

describe('activateTradeRoutes', () => {
  it('activates trade on shared edges', () => {
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1' }),
      makeProvince({ id: 'p2', ownerId: 'n2' }),
    ];
    const edges: Edge[] = [
      { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 5, chokepoint: false, tradeActive: false },
    ];
    const result = activateTradeRoutes(edges, provinces, 'n1', 'n2');
    expect(result[0].tradeActive).toBe(true);
  });

  it('does not activate edges not shared by the two nations', () => {
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1' }),
      makeProvince({ id: 'p2', ownerId: 'n1' }),
    ];
    const edges: Edge[] = [
      { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 5, chokepoint: false, tradeActive: false },
    ];
    const result = activateTradeRoutes(edges, provinces, 'n1', 'n2');
    expect(result[0].tradeActive).toBe(false);
  });
});

describe('deactivateTradeRoutes', () => {
  it('deactivates trade on shared edges', () => {
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1' }),
      makeProvince({ id: 'p2', ownerId: 'n2' }),
    ];
    const edges: Edge[] = [
      { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 5, chokepoint: false, tradeActive: true },
    ];
    const result = deactivateTradeRoutes(edges, provinces, 'n1', 'n2');
    expect(result[0].tradeActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllianceAutoJoiners
// ---------------------------------------------------------------------------

describe('getAllianceAutoJoiners', () => {
  it('returns allies of defender that auto-join', () => {
    const ally = makeNation({
      id: 'n3',
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const defender = makeNation({ id: 'n2' });
    const aggressor = makeNation({ id: 'n1' });
    const nations = [aggressor, defender, ally];
    const result = getAllianceAutoJoiners('n2', 'n1', nations, []);
    expect(result).toEqual(['n3']);
  });

  it('does not include eliminated nations', () => {
    const ally = makeNation({
      id: 'n3',
      eliminatedOnTurn: 2,
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const nations = [makeNation({ id: 'n1' }), makeNation({ id: 'n2' }), ally];
    const result = getAllianceAutoJoiners('n2', 'n1', nations, []);
    expect(result).toEqual([]);
  });

  it('does not include nations already at war with aggressor', () => {
    const ally = makeNation({
      id: 'n3',
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const nations = [makeNation({ id: 'n1' }), makeNation({ id: 'n2' }), ally];
    const wars: War[] = [{ aggressorId: 'n3', defenderId: 'n1', startedOnTurn: 1 }];
    const result = getAllianceAutoJoiners('n2', 'n1', nations, wars);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateIntelFromAgreements
// ---------------------------------------------------------------------------

describe('updateIntelFromAgreements', () => {
  it('reveals military + diplomatic tracks for Military Alliance', () => {
    const nation = makeNation({
      id: 'n1',
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const n2 = makeNation({ id: 'n2' });
    const result = updateIntelFromAgreements(nation, [nation, n2]);
    expect(result.intelOf.n2.military).toBe('Revealed');
    expect(result.intelOf.n2.diplomatic).toBe('Revealed');
  });

  it('reveals economic track for Trade Deal', () => {
    const nation = makeNation({
      id: 'n1',
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const n2 = makeNation({ id: 'n2' });
    const result = updateIntelFromAgreements(nation, [nation, n2]);
    expect(result.intelOf.n2.economic).toBe('Revealed');
  });
});
