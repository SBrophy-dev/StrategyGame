import { describe, it, expect } from 'vitest';
import { CONFLICT_PRIORITY, calculateNationScore, resolveOrders } from './resolution';
import type {
  Nation,
  Province,
  Edge,
  Army,
  GameState,
  Scenario,
  Order,
} from '../types';

// ---------------------------------------------------------------------------
// Test helpers — minimal fixtures
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
    name: 'Province 1',
    ownerId: 'n1',
    terrain: 'Plains',
    devLevel: 2,
    focus: 'Agricultural',
    unrest: 0,
    fortLevel: 0,
    population: 'Medium',
    strategicTag: null,
    layout: { x: 0, y: 0, polygon: [[0, 0], [1, 0], [0, 1]] },
    ...overrides,
  };
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    meta: {
      id: 'test',
      name: 'Test Scenario',
      description: 'Test',
      turnLimit: 40,
      victoryConditions: {
        primaryObjective: { type: 'control_regions', regions: ['p1'], turnsHeld: 3 },
        dominationThreshold: 0.65,
        turnLimit: 40,
        tiebreaker: 'total_score',
      },
      exileWindowTurns: 5,
      exileRestoreCost: 30,
      siegeTurns: 3,
      relationDecayPerTurn: 1,
    },
    world: { provinces: [], edges: [] },
    nations: [],
    startingState: { provinceOwnership: {}, armies: [], resources: {}, relations: {} },
    scriptedEvents: [],
    genericEvents: [],
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    scenario: makeScenario(),
    turn: 1,
    provinces: [],
    edges: [],
    nations: [],
    armies: [],
    wars: [],
    turnLogs: [],
    eliminationLog: [],
    winner: null,
    gameOver: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CONFLICT_PRIORITY constant
// ---------------------------------------------------------------------------

describe('CONFLICT_PRIORITY', () => {
  it('has all 7 priority levels defined', () => {
    expect(CONFLICT_PRIORITY.PEACE_OVER_WAR).toBe(1);
    expect(CONFLICT_PRIORITY.DEFENDER_SWAP).toBe(2);
    expect(CONFLICT_PRIORITY.BLOCKADE_OVER_TRADE).toBe(3);
    expect(CONFLICT_PRIORITY.AGREEMENT_QUEUE_ORDER).toBe(4);
    expect(CONFLICT_PRIORITY.SIMULTANEOUS_ENTRY).toBe(5);
    expect(CONFLICT_PRIORITY.SIMULTANEOUS_WAR).toBe(6);
    expect(CONFLICT_PRIORITY.ALLIANCE_TIEBREAK).toBe(7);
  });

  it('has priorities in ascending order', () => {
    expect(CONFLICT_PRIORITY.PEACE_OVER_WAR).toBeLessThan(CONFLICT_PRIORITY.DEFENDER_SWAP);
    expect(CONFLICT_PRIORITY.DEFENDER_SWAP).toBeLessThan(CONFLICT_PRIORITY.BLOCKADE_OVER_TRADE);
    expect(CONFLICT_PRIORITY.BLOCKADE_OVER_TRADE).toBeLessThan(CONFLICT_PRIORITY.AGREEMENT_QUEUE_ORDER);
    expect(CONFLICT_PRIORITY.AGREEMENT_QUEUE_ORDER).toBeLessThan(CONFLICT_PRIORITY.SIMULTANEOUS_ENTRY);
    expect(CONFLICT_PRIORITY.SIMULTANEOUS_ENTRY).toBeLessThan(CONFLICT_PRIORITY.SIMULTANEOUS_WAR);
    expect(CONFLICT_PRIORITY.SIMULTANEOUS_WAR).toBeLessThan(CONFLICT_PRIORITY.ALLIANCE_TIEBREAK);
  });
});

// ---------------------------------------------------------------------------
// calculateNationScore
// ---------------------------------------------------------------------------

describe('calculateNationScore', () => {
  it('computes devLevel×10 + gold + agreements×15', () => {
    const nation = makeNation({
      id: 'n1',
      resources: { gold: 50, food: 0, production: 0, influence: 0, manpower: 0 },
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1', devLevel: 3 }), // 30
      makeProvince({ id: 'p2', ownerId: 'n1', devLevel: 2 }), // 20
    ];
    // devScore = 30 + 20 = 50, gold = 50, agreements = 1 × 15 = 15
    expect(calculateNationScore(nation, provinces)).toBe(115);
  });

  it('returns 0 for nation with no provinces and 0 gold and no agreements', () => {
    const nation = makeNation({
      resources: { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 },
    });
    expect(calculateNationScore(nation, [])).toBe(0);
  });

  it('ignores provinces owned by other nations', () => {
    const nation = makeNation({
      id: 'n1',
      resources: { gold: 10, food: 0, production: 0, influence: 0, manpower: 0 },
    });
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1', devLevel: 2 }), // 20
      makeProvince({ id: 'p2', ownerId: 'n2', devLevel: 5 }), // ignored
    ];
    expect(calculateNationScore(nation, provinces)).toBe(30); // 20 + 10 + 0
  });

  it('does not count inactive agreements', () => {
    const nation = makeNation({
      id: 'n1',
      resources: { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 },
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: false }],
      },
    });
    expect(calculateNationScore(nation, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CONFLICT_PRIORITY case tests via resolveOrders integration
// ---------------------------------------------------------------------------

describe('P1: Peace offers beat war declarations', () => {
  it('mutual peace ends war and overrides war declaration on same turn', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: -50 } });
    const n2 = makeNation({ id: 'n2', relations: { n1: -50 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });

    const state = makeGameState({
      nations: [n1, n2],
      provinces: [p1, p2],
      wars: [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'offer_peace', nationId: 'n1', targetNationId: 'n2' }],
      n2: [{ type: 'offer_peace', nationId: 'n2', targetNationId: 'n1' }],
    };

    const result = resolveOrders(state, orders, []);
    // War should be resolved
    expect(result.wars).toHaveLength(0);
    // Conflict report should mention peace_over_war
    const lastLog = result.turnLogs[result.turnLogs.length - 1];
    expect(lastLog.conflictReport.entries.some((e) => e.type === 'peace_over_war')).toBe(true);
  });
});

describe('P2: Defender beats attacker in province-swap', () => {
  it('detects province swap and creates battle in defender origin', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: -50 } });
    const n2 = makeNation({ id: 'n2', relations: { n1: -50 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });
    const edge: Edge = { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 0, chokepoint: false, tradeActive: false };

    const a1: Army = { id: 'a1', type: 'Land', strength: 20, provinceId: 'p1', ownerId: 'n1', siegeTurns: 0 };
    const a2: Army = { id: 'a2', type: 'Land', strength: 20, provinceId: 'p2', ownerId: 'n2', siegeTurns: 0 };

    const state = makeGameState({
      nations: [n1, n2],
      provinces: [p1, p2],
      edges: [edge],
      armies: [a1, a2],
      wars: [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'move_army', nationId: 'n1', armyId: 'a1', fromProvinceId: 'p1', toProvinceId: 'p2' }],
      n2: [{ type: 'move_army', nationId: 'n2', armyId: 'a2', fromProvinceId: 'p2', toProvinceId: 'p1' }],
    };

    const result = resolveOrders(state, orders, []);
    const lastLog = result.turnLogs[result.turnLogs.length - 1];
    expect(lastLog.conflictReport.entries.some((e) => e.type === 'defender_swap')).toBe(true);
  });
});

describe('P3: Blockade beats trade route activation', () => {
  it('naval blockade deactivates trade on edge', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: -50 } });
    const n2 = makeNation({ id: 'n2', relations: { n1: -50 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });
    const edge: Edge = { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 5, chokepoint: false, tradeActive: true };
    const navalArmy: Army = { id: 'a1', type: 'Naval', strength: 10, provinceId: 'p1', ownerId: 'n1', siegeTurns: 0 };

    const state = makeGameState({
      nations: [n1, n2],
      provinces: [p1, p2],
      edges: [edge],
      armies: [navalArmy],
      wars: [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'blockade', nationId: 'n1', armyId: 'a1', edgeSourceId: 'p1', edgeTargetId: 'p2' }],
      n2: [],
    };

    const result = resolveOrders(state, orders, []);
    const targetEdge = result.edges.find((e) => e.sourceId === 'p1' && e.targetId === 'p2');
    expect(targetEdge!.tradeActive).toBe(false);
  });
});

describe('P4: Agreement queue order', () => {
  it('earlier agreement takes priority for same nation pair', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: 60 } });
    const n2 = makeNation({ id: 'n2', relations: { n1: 60 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });

    const state = makeGameState({
      nations: [n1, n2],
      provinces: [p1, p2],
    });

    // Both propose TradeDeal to each other — first should take priority
    const orders: Record<string, Order[]> = {
      n1: [{ type: 'propose_agreement', nationId: 'n1', targetNationId: 'n2', agreementType: 'TradeDeal' }],
      n2: [{ type: 'propose_agreement', nationId: 'n2', targetNationId: 'n1', agreementType: 'TradeDeal' }],
    };

    const result = resolveOrders(state, orders, []);
    // Should have at least one agreement created, and one logged as duplicate (P4)
    const lastLog = result.turnLogs[result.turnLogs.length - 1];
    const hasP4 = lastLog.conflictReport.entries.some((e) => e.type === 'agreement_priority');
    // At least the agreement should exist
    const n1Updated = result.nations.find((n) => n.id === 'n1')!;
    const hasTradeDeal = n1Updated.agreements.n2?.some((a) => a.type === 'TradeDeal' && a.active);
    expect(hasTradeDeal || hasP4).toBe(true);
  });
});

describe('P5: Simultaneous entry into empty province', () => {
  it('halts both armies when two hostile armies move into empty province', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: -50 } });
    const n2 = makeNation({ id: 'n2', relations: { n1: -50 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });
    const pEmpty = makeProvince({ id: 'p3', ownerId: null, name: 'Empty' });
    const edge1: Edge = { sourceId: 'p1', targetId: 'p3', movementCost: 1, tradeValue: 0, chokepoint: false, tradeActive: false };
    const edge2: Edge = { sourceId: 'p2', targetId: 'p3', movementCost: 1, tradeValue: 0, chokepoint: false, tradeActive: false };

    const a1: Army = { id: 'a1', type: 'Land', strength: 20, provinceId: 'p1', ownerId: 'n1', siegeTurns: 0 };
    const a2: Army = { id: 'a2', type: 'Land', strength: 20, provinceId: 'p2', ownerId: 'n2', siegeTurns: 0 };

    const state = makeGameState({
      nations: [n1, n2],
      provinces: [p1, p2, pEmpty],
      edges: [edge1, edge2],
      armies: [a1, a2],
      wars: [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'move_army', nationId: 'n1', armyId: 'a1', fromProvinceId: 'p1', toProvinceId: 'p3' }],
      n2: [{ type: 'move_army', nationId: 'n2', armyId: 'a2', fromProvinceId: 'p2', toProvinceId: 'p3' }],
    };

    const result = resolveOrders(state, orders, []);
    const lastLog = result.turnLogs[result.turnLogs.length - 1];
    expect(lastLog.conflictReport.entries.some((e) => e.type === 'simultaneous_entry')).toBe(true);
    // Province should remain empty
    const emptyProvince = result.provinces.find((p) => p.id === 'p3');
    expect(emptyProvince!.ownerId).toBeNull();
  });
});

describe('P6: Simultaneous war declarations', () => {
  it('logs simultaneous war declaration by multiple nations on same target', () => {
    const n1 = makeNation({ id: 'n1', relations: { n3: -50 } });
    const n2 = makeNation({ id: 'n2', relations: { n3: -50 } });
    const n3 = makeNation({ id: 'n3', relations: { n1: -50, n2: -50 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });
    const p3 = makeProvince({ id: 'p3', ownerId: 'n3', strategicTag: 'Capital' });

    const state = makeGameState({
      nations: [n1, n2, n3],
      provinces: [p1, p2, p3],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'declare_war', nationId: 'n1', targetNationId: 'n3' }],
      n2: [{ type: 'declare_war', nationId: 'n2', targetNationId: 'n3' }],
      n3: [],
    };

    const result = resolveOrders(state, orders, []);
    const lastLog = result.turnLogs[result.turnLogs.length - 1];
    expect(lastLog.conflictReport.entries.some((e) => e.type === 'simultaneous_war_declaration')).toBe(true);
    // Both wars should be created
    expect(result.wars.length).toBeGreaterThanOrEqual(2);
  });
});

describe('P7: Alliance proposal tiebreak', () => {
  it('accepts alliance from nation with higher relation, declines the other', () => {
    const n1 = makeNation({ id: 'n1', relations: { n3: 70 } });
    const n2 = makeNation({ id: 'n2', relations: { n3: 55 } });
    const n3 = makeNation({ id: 'n3', relations: { n1: 70, n2: 55 } });
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });
    const p2 = makeProvince({ id: 'p2', ownerId: 'n2', strategicTag: 'Capital' });
    const p3 = makeProvince({ id: 'p3', ownerId: 'n3', strategicTag: 'Capital' });

    const state = makeGameState({
      nations: [n1, n2, n3],
      provinces: [p1, p2, p3],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'propose_agreement', nationId: 'n1', targetNationId: 'n3', agreementType: 'MilitaryAlliance' }],
      n2: [{ type: 'propose_agreement', nationId: 'n2', targetNationId: 'n3', agreementType: 'MilitaryAlliance' }],
      n3: [],
    };

    const result = resolveOrders(state, orders, []);
    const lastLog = result.turnLogs[result.turnLogs.length - 1];
    expect(lastLog.conflictReport.entries.some((e) => e.type === 'alliance_proposal_tiebreak')).toBe(true);

    // n1 (higher relation) should have the alliance, n2 should not
    const n3Updated = result.nations.find((n) => n.id === 'n3')!;
    const allianceWithN1 = n3Updated.agreements.n1?.some((a) => a.type === 'MilitaryAlliance' && a.active);
    const allianceWithN2 = n3Updated.agreements.n2?.some((a) => a.type === 'MilitaryAlliance' && a.active);
    expect(allianceWithN1).toBe(true);
    expect(allianceWithN2).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// resolveOrders — basic integration
// ---------------------------------------------------------------------------

describe('resolveOrders', () => {
  it('increments turn number', () => {
    const state = makeGameState({ turn: 5 });
    const result = resolveOrders(state, {}, []);
    expect(result.turn).toBe(6);
  });

  it('appends a turn log entry', () => {
    const state = makeGameState({ turnLogs: [] });
    const result = resolveOrders(state, {}, []);
    expect(result.turnLogs).toHaveLength(1);
    expect(result.turnLogs[0].turn).toBe(state.turn);
  });

  it('resolves construction orders (upgrade_dev)', () => {
    const province = makeProvince({ id: 'p1', ownerId: 'n1', devLevel: 2, focus: 'Agricultural', strategicTag: 'Capital' });
    const nation = makeNation({
      id: 'n1',
      resources: { gold: 200, food: 50, production: 200, influence: 30, manpower: 40 },
    });
    const state = makeGameState({
      nations: [nation],
      provinces: [province],
    });

    const orders: Record<string, Order[]> = {
      n1: [{ type: 'upgrade_dev', nationId: 'n1', provinceId: 'p1' }],
    };

    const result = resolveOrders(state, orders, []);
    const updatedProvince = result.provinces.find((p) => p.id === 'p1')!;
    expect(updatedProvince.devLevel).toBe(3);
  });

  it('eliminates a nation that owns zero provinces', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: -50 } });
    const n2 = makeNation({ id: 'n2', relations: { n1: -50 } });
    // n2 owns no provinces — will be eliminated
    const p1 = makeProvince({ id: 'p1', ownerId: 'n1', strategicTag: 'Capital' });

    const state = makeGameState({
      nations: [n1, n2],
      provinces: [p1],
      wars: [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }],
    });

    const result = resolveOrders(state, { n1: [], n2: [] }, []);
    const eliminatedN2 = result.nations.find((n) => n.id === 'n2')!;
    expect(eliminatedN2.eliminatedOnTurn).toBeDefined();
    expect(result.eliminationLog.length).toBeGreaterThanOrEqual(1);
  });
});
