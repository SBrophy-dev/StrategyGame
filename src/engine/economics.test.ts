import { describe, it, expect } from 'vitest';
import {
  getBuildings,
  getProvinceOutput,
  getManpowerSoftCap,
  getInfluenceSoftCap,
  getNationIncome,
  getArmyFoodConsumption,
  getTradeDealBonus,
  getVassalTribute,
  runBookkeeping,
} from './economics';
import type {
  Province,
  Edge,
  Nation,
  Army,
  Scenario,
  GameState,
} from '../types';

// ---------------------------------------------------------------------------
// Test helpers — minimal fixtures
// ---------------------------------------------------------------------------

function makeProvince(overrides: Partial<Province> = {}): Province {
  return {
    id: 'p1',
    name: 'Test Province',
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

function makeNation(overrides: Partial<Nation> = {}): Nation {
  return {
    id: 'n1',
    name: 'Test Nation',
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
    startingState: {
      provinceOwnership: {},
      armies: [],
      resources: {},
      relations: {},
    },
    scriptedEvents: [],
    genericEvents: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getBuildings
// ---------------------------------------------------------------------------

describe('getBuildings', () => {
  it('returns Settlement for devLevel 1', () => {
    const buildings = getBuildings(1, null);
    expect(buildings).toHaveLength(1);
    expect(buildings[0].name).toBe('Settlement');
  });

  it('returns Settlement when focus is null regardless of devLevel', () => {
    const buildings = getBuildings(3, null);
    expect(buildings).toHaveLength(1);
    expect(buildings[0].name).toBe('Settlement');
  });

  it('returns focus-specific buildings at devLevel 2', () => {
    const agri = getBuildings(2, 'Agricultural');
    expect(agri).toHaveLength(1);
    expect(agri[0].name).toBe('Farmstead');

    const mil = getBuildings(2, 'Military');
    expect(mil).toHaveLength(1);
    expect(mil[0].name).toBe('Barracks');
  });

  it('returns increasing buildings at higher dev levels', () => {
    expect(getBuildings(3, 'Commercial')).toHaveLength(2);
    expect(getBuildings(4, 'Industrial')).toHaveLength(3);
    expect(getBuildings(5, 'Military')).toHaveLength(4);
  });

  it('returns a copy (not shared reference)', () => {
    const a = getBuildings(2, 'Agricultural');
    const b = getBuildings(2, 'Agricultural');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// getProvinceOutput
// ---------------------------------------------------------------------------

describe('getProvinceOutput', () => {
  const scenario = makeScenario();

  it('returns empty output for unowned province', () => {
    const p = makeProvince({ ownerId: null });
    const output = getProvinceOutput(p, scenario);
    expect(output).toEqual({ gold: 0, food: 0, production: 0, influence: 0, manpower: 0 });
  });

  it('returns empty output for rebel province', () => {
    const p = makeProvince({ ownerId: 'rebel' });
    const output = getProvinceOutput(p, scenario);
    expect(output).toEqual({ gold: 0, food: 0, production: 0, influence: 0, manpower: 0 });
  });

  it('returns correct output for devLevel 1 (Agricultural default)', () => {
    const p = makeProvince({ devLevel: 1, focus: null });
    const output = getProvinceOutput(p, scenario);
    // devLevel 1 defaults to Agricultural: food +2
    expect(output.food).toBe(2);
  });

  it('returns correct output for devLevel 3 Commercial', () => {
    const p = makeProvince({ devLevel: 3, focus: 'Commercial' });
    const output = getProvinceOutput(p, scenario);
    expect(output.gold).toBe(7);
  });

  it('returns correct output for devLevel 5 Military', () => {
    const p = makeProvince({ devLevel: 5, focus: 'Military' });
    const output = getProvinceOutput(p, scenario);
    expect(output.manpower).toBe(13);
    expect(output.production).toBe(5);
  });

  it('uses scenario developmentOutputTable override when provided', () => {
    const customScenario = makeScenario({
      meta: {
        ...makeScenario().meta,
        developmentOutputTable: {
          '1': { Agricultural: { food: 99 } },
        },
      },
    });
    const p = makeProvince({ devLevel: 1, focus: null });
    const output = getProvinceOutput(p, customScenario);
    expect(output.food).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// getManpowerSoftCap
// ---------------------------------------------------------------------------

describe('getManpowerSoftCap', () => {
  it('returns 0 for a nation with no provinces', () => {
    expect(getManpowerSoftCap('n1', [])).toBe(0);
  });

  it('computes cap from population × devLevel', () => {
    const provinces = [
      makeProvince({ ownerId: 'n1', population: 'Medium', devLevel: 3 }), // 2×3 = 6
      makeProvince({ id: 'p2', ownerId: 'n1', population: 'Thriving', devLevel: 2 }), // 4×2 = 8
    ];
    expect(getManpowerSoftCap('n1', provinces)).toBe(14);
  });

  it('ignores provinces owned by other nations', () => {
    const provinces = [
      makeProvince({ ownerId: 'n1', population: 'Low', devLevel: 1 }), // 1×1 = 1
      makeProvince({ id: 'p2', ownerId: 'n2', population: 'Thriving', devLevel: 5 }), // ignored
    ];
    expect(getManpowerSoftCap('n1', provinces)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getInfluenceSoftCap
// ---------------------------------------------------------------------------

describe('getInfluenceSoftCap', () => {
  it('returns archetype base cap with no trade deals', () => {
    expect(getInfluenceSoftCap(makeNation({ archetype: 'Expansionist' }))).toBe(60);
    expect(getInfluenceSoftCap(makeNation({ archetype: 'Trader' }))).toBe(120);
    expect(getInfluenceSoftCap(makeNation({ archetype: 'Isolationist' }))).toBe(50);
    expect(getInfluenceSoftCap(makeNation({ archetype: 'Hegemon' }))).toBe(90);
  });

  it('adds 5 per active Trade Deal', () => {
    const nation = makeNation({
      archetype: 'Trader',
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
        n3: [{ type: 'TradeDeal', partnerNationId: 'n3', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    expect(getInfluenceSoftCap(nation)).toBe(130); // 120 + 5 + 5
  });

  it('does not count inactive Trade Deals', () => {
    const nation = makeNation({
      archetype: 'Expansionist',
      agreements: {
        n2: [{ type: 'TradeDeal', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: false }],
      },
    });
    expect(getInfluenceSoftCap(nation)).toBe(60);
  });

  it('does not count non-TradeDeal agreements', () => {
    const nation = makeNation({
      archetype: 'Expansionist',
      agreements: {
        n2: [{ type: 'MilitaryAlliance', partnerNationId: 'n2', startedOnTurn: 1, expiresOnTurn: null, active: true }],
      },
    });
    expect(getInfluenceSoftCap(nation)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// getNationIncome
// ---------------------------------------------------------------------------

describe('getNationIncome', () => {
  const scenario = makeScenario();

  it('sums output from all owned provinces', () => {
    const provinces = [
      makeProvince({ ownerId: 'n1', devLevel: 2, focus: 'Agricultural' }), // food +4
      makeProvince({ id: 'p2', ownerId: 'n1', devLevel: 2, focus: 'Commercial' }), // gold +4
    ];
    const income = getNationIncome('n1', provinces, scenario);
    expect(income.food).toBe(4);
    expect(income.gold).toBe(4);
  });

  it('ignores provinces owned by others', () => {
    const provinces = [
      makeProvince({ ownerId: 'n1', devLevel: 2, focus: 'Agricultural' }),
      makeProvince({ id: 'p2', ownerId: 'n2', devLevel: 5, focus: 'Commercial' }),
    ];
    const income = getNationIncome('n1', provinces, scenario);
    expect(income.gold).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getArmyFoodConsumption
// ---------------------------------------------------------------------------

describe('getArmyFoodConsumption', () => {
  it('returns 0 with no armies', () => {
    expect(getArmyFoodConsumption('n1', [])).toBe(0);
  });

  it('sums strength of owned armies', () => {
    const armies: Army[] = [
      { id: 'a1', type: 'Land', strength: 20, provinceId: 'p1', ownerId: 'n1', siegeTurns: 0 },
      { id: 'a2', type: 'Naval', strength: 10, provinceId: 'p2', ownerId: 'n1', siegeTurns: 0 },
    ];
    expect(getArmyFoodConsumption('n1', armies)).toBe(30);
  });

  it('ignores armies of other nations', () => {
    const armies: Army[] = [
      { id: 'a1', type: 'Land', strength: 20, provinceId: 'p1', ownerId: 'n1', siegeTurns: 0 },
      { id: 'a2', type: 'Land', strength: 50, provinceId: 'p2', ownerId: 'n2', siegeTurns: 0 },
    ];
    expect(getArmyFoodConsumption('n1', armies)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// getTradeDealBonus
// ---------------------------------------------------------------------------

describe('getTradeDealBonus', () => {
  it('returns 0 with no active trade edges', () => {
    const edges: Edge[] = [
      { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 5, chokepoint: false, tradeActive: false },
    ];
    expect(getTradeDealBonus('n1', edges, [])).toBe(0);
  });

  it('sums tradeValue from active trade edges where nation owns a province', () => {
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1' }),
      makeProvince({ id: 'p2', ownerId: 'n2' }),
    ];
    const edges: Edge[] = [
      { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 5, chokepoint: false, tradeActive: true },
    ];
    expect(getTradeDealBonus('n1', edges, provinces)).toBe(5);
  });

  it('does not count edges where nation owns neither province', () => {
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n2' }),
      makeProvince({ id: 'p2', ownerId: 'n3' }),
    ];
    const edges: Edge[] = [
      { sourceId: 'p1', targetId: 'p2', movementCost: 1, tradeValue: 10, chokepoint: false, tradeActive: true },
    ];
    expect(getTradeDealBonus('n1', edges, provinces)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getVassalTribute
// ---------------------------------------------------------------------------

describe('getVassalTribute', () => {
  it('returns empty when no vassals exist', () => {
    const nations = [makeNation({ id: 'n1' }), makeNation({ id: 'n2' })];
    const tribute = getVassalTribute('n1', nations);
    expect(tribute.gold).toBe(0);
    expect(tribute.production).toBe(0);
  });

  it('collects 10% of vassal gold and production', () => {
    const vassal = makeNation({
      id: 'n2',
      resources: { gold: 200, food: 50, production: 100, influence: 30, manpower: 40 },
      agreements: {
        n1: [{
          type: 'Vassalage',
          partnerNationId: 'n1',
          startedOnTurn: 1,
          expiresOnTurn: null,
          active: true,
        }],
      },
    });
    const nations = [makeNation({ id: 'n1' }), vassal];
    const tribute = getVassalTribute('n1', nations);
    expect(tribute.gold).toBe(20); // floor(200 * 0.1)
    expect(tribute.production).toBe(10); // floor(100 * 0.1)
  });
});

// ---------------------------------------------------------------------------
// runBookkeeping
// ---------------------------------------------------------------------------

describe('runBookkeeping', () => {
  it('adds income and subtracts food consumption', () => {
    const province = makeProvince({ ownerId: 'n1', devLevel: 2, focus: 'Agricultural' }); // food +4
    const nation = makeNation({
      resources: { gold: 100, food: 50, production: 50, influence: 30, manpower: 20 },
    });
    const armies: Army[] = [
      { id: 'a1', type: 'Land', strength: 10, provinceId: 'p1', ownerId: 'n1', siegeTurns: 0 },
    ];
    const scenario = makeScenario();
    const state: GameState = {
      scenario,
      turn: 1,
      provinces: [province],
      edges: [],
      nations: [nation],
      armies,
      wars: [],
      turnLogs: [],
      eliminationLog: [],
      winner: null,
      gameOver: false,
    };

    const result = runBookkeeping(nation, state);
    // food: 50 + 4 (income) - 10 (army consumption) = 44
    expect(result.food).toBe(44);
  });

  it('applies influence decay when over cap', () => {
    const nation = makeNation({
      archetype: 'Expansionist', // base cap 60
      resources: { gold: 0, food: 0, production: 0, influence: 100, manpower: 0 },
      agreements: {},
    });
    const scenario = makeScenario();
    const state: GameState = {
      scenario,
      turn: 1,
      provinces: [],
      edges: [],
      nations: [nation],
      armies: [],
      wars: [],
      turnLogs: [],
      eliminationLog: [],
      winner: null,
      gameOver: false,
    };

    const result = runBookkeeping(nation, state);
    // influence: 100 + 0 income = 100, cap = 60, excess = 40, decay = ceil(40 * 0.1) = 4
    expect(result.influence).toBe(96);
  });

  it('caps manpower at soft cap', () => {
    const province = makeProvince({
      ownerId: 'n1',
      population: 'Low',
      devLevel: 1,
      focus: null,
    }); // cap = 1×1 = 1
    const nation = makeNation({
      resources: { gold: 0, food: 0, production: 0, influence: 0, manpower: 50 },
    });
    const scenario = makeScenario();
    const state: GameState = {
      scenario,
      turn: 1,
      provinces: [province],
      edges: [],
      nations: [nation],
      armies: [],
      wars: [],
      turnLogs: [],
      eliminationLog: [],
      winner: null,
      gameOver: false,
    };

    const result = runBookkeeping(nation, state);
    // manpower soft cap = 1, manpower should be capped
    // income from devLevel 1 Agricultural default adds manpower 0, food 2
    // manpower: 50 + 0 = 50, but cap = 1, so 1
    expect(result.manpower).toBeLessThanOrEqual(1);
  });
});
