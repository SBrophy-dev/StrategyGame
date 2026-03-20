import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateEventTrigger,
  applyResourceDelta,
  applyRelationDelta,
  applyUnrestDelta,
  applyOwnerChange,
  applyPopulationChange,
  applyEventEffects,
  evaluateAndApplyEvents,
} from './events';
import type {
  Nation,
  Province,
  War,
  GameState,
  GameEvent,
  Scenario,
  ResourceDeltaEffect,
  RelationDeltaEffect,
  UnrestDeltaEffect,
  OwnerChangeEffect,
  PopulationChangeEffect,
} from '../types';

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

function makeScenario(): Scenario {
  return {
    meta: {
      id: 'test', name: 'Test', description: 'Test', turnLimit: 40,
      victoryConditions: {
        primaryObjective: { type: 'control_regions', regions: ['p1'], turnsHeld: 3 },
        dominationThreshold: 0.65, turnLimit: 40, tiebreaker: 'total_score',
      },
      exileWindowTurns: 5, exileRestoreCost: 30, siegeTurns: 3, relationDecayPerTurn: 1,
    },
    world: { provinces: [], edges: [] },
    nations: [],
    startingState: { provinceOwnership: {}, armies: [], resources: {}, relations: {} },
    scriptedEvents: [],
    genericEvents: [],
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    scenario: makeScenario(),
    turn: 1,
    provinces: [],
    edges: [],
    nations: [makeNation()],
    armies: [],
    wars: [],
    turnLogs: [],
    eliminationLog: [],
    winner: null,
    gameOver: false,
    ...overrides,
  };
}

function makeConditionContext(overrides: Record<string, unknown> = {}) {
  const nation = makeNation();
  const provinces = [makeProvince()];
  return {
    nation,
    provinces,
    ownedProvinces: provinces.filter((p) => p.ownerId === nation.id),
    wars: [] as War[],
    turn: 1,
    state: makeState({ nations: [nation], provinces }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  it('evaluates nation.wars.length > N', () => {
    const wars: War[] = [
      { aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 },
      { aggressorId: 'n3', defenderId: 'n1', startedOnTurn: 2 },
    ];
    const ctx = makeConditionContext({ wars });
    expect(evaluateCondition('nation.wars.length > 0', ctx)).toBe(true);
    expect(evaluateCondition('nation.wars.length > 5', ctx)).toBe(false);
  });

  it('evaluates nation.resources.gold < N', () => {
    const nation = makeNation({ resources: { gold: -10, food: 50, production: 50, influence: 30, manpower: 40 } });
    const ctx = makeConditionContext({ nation });
    expect(evaluateCondition('nation.resources.gold < 0', ctx)).toBe(true);
  });

  it('evaluates nation.resources.manpower < N', () => {
    const nation = makeNation({ resources: { gold: 100, food: 50, production: 50, influence: 30, manpower: 25 } });
    const ctx = makeConditionContext({ nation });
    expect(evaluateCondition('nation.resources.manpower < 30', ctx)).toBe(true);
    expect(evaluateCondition('nation.resources.manpower < 20', ctx)).toBe(false);
  });

  it('evaluates province.unrest >= N', () => {
    const provinces = [makeProvince({ unrest: 100 })];
    const ctx = makeConditionContext({
      provinces,
      ownedProvinces: provinces,
    });
    expect(evaluateCondition('province.unrest >= 100', ctx)).toBe(true);
  });

  it('evaluates war_turns >= N', () => {
    const wars: War[] = [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }];
    const ctx = makeConditionContext({ wars, turn: 6 }); // war_turns = 6-1 = 5
    expect(evaluateCondition('war_turns >= 5', ctx)).toBe(true);
    expect(evaluateCondition('war_turns >= 10', ctx)).toBe(false);
  });

  it('evaluates nation.size >= N', () => {
    const provinces = [
      makeProvince({ id: 'p1', ownerId: 'n1' }),
      makeProvince({ id: 'p2', ownerId: 'n1' }),
      makeProvince({ id: 'p3', ownerId: 'n1' }),
    ];
    const ctx = makeConditionContext({ ownedProvinces: provinces });
    expect(evaluateCondition('nation.size >= 3', ctx)).toBe(true);
    expect(evaluateCondition('nation.size >= 5', ctx)).toBe(false);
  });

  it('evaluates province.population == "High"', () => {
    const provinces = [makeProvince({ population: 'High' })];
    const ctx = makeConditionContext({ ownedProvinces: provinces });
    expect(evaluateCondition('province.population == "High"', ctx)).toBe(true);
    expect(evaluateCondition('province.population == "Thriving"', ctx)).toBe(false);
  });

  it('returns false for unrecognized conditions', () => {
    const ctx = makeConditionContext();
    expect(evaluateCondition('unknown_condition > 5', ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateEventTrigger
// ---------------------------------------------------------------------------

describe('evaluateEventTrigger', () => {
  it('triggers on matching turn number', () => {
    const event: GameEvent = {
      id: 'e1',
      trigger: { type: 'turn', onTurn: 5 },
      effects: [],
      narrative: 'test',
    };
    expect(evaluateEventTrigger(event, makeConditionContext({ turn: 5 }))).toBe(true);
    expect(evaluateEventTrigger(event, makeConditionContext({ turn: 4 }))).toBe(false);
  });

  it('triggers when all conditions are met', () => {
    const event: GameEvent = {
      id: 'e1',
      trigger: { type: 'condition', conditions: ['nation.wars.length > 0', 'nation.resources.manpower < 30'] },
      effects: [],
      narrative: 'test',
    };
    const nation = makeNation({ resources: { gold: 0, food: 0, production: 0, influence: 0, manpower: 25 } });
    const wars: War[] = [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }];
    const ctx = makeConditionContext({ nation, wars });
    expect(evaluateEventTrigger(event, ctx)).toBe(true);
  });

  it('does not trigger when only some conditions are met', () => {
    const event: GameEvent = {
      id: 'e1',
      trigger: { type: 'condition', conditions: ['nation.wars.length > 0', 'nation.resources.manpower < 30'] },
      effects: [],
      narrative: 'test',
    };
    const ctx = makeConditionContext(); // no wars
    expect(evaluateEventTrigger(event, ctx)).toBe(false);
  });

  it('returns false for condition trigger with empty conditions', () => {
    const event: GameEvent = {
      id: 'e1',
      trigger: { type: 'condition', conditions: [] },
      effects: [],
      narrative: 'test',
    };
    expect(evaluateEventTrigger(event, makeConditionContext())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

describe('applyResourceDelta', () => {
  it('adds to the specified resource', () => {
    const nation = makeNation({ resources: { gold: 100, food: 50, production: 50, influence: 30, manpower: 40 } });
    const effect: ResourceDeltaEffect = { type: 'resource_delta', resource: 'manpower', amount: -10 };
    const result = applyResourceDelta(nation, effect);
    expect(result.resources.manpower).toBe(30);
  });

  it('allows negative values', () => {
    const nation = makeNation({ resources: { gold: 5, food: 50, production: 50, influence: 30, manpower: 40 } });
    const effect: ResourceDeltaEffect = { type: 'resource_delta', resource: 'gold', amount: -20 };
    const result = applyResourceDelta(nation, effect);
    expect(result.resources.gold).toBe(-15);
  });
});

describe('applyRelationDelta', () => {
  it('modifies relation toward all_at_war targets', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: 0 } });
    const n2 = makeNation({ id: 'n2' });
    const wars: War[] = [{ aggressorId: 'n1', defenderId: 'n2', startedOnTurn: 1 }];
    const effect: RelationDeltaEffect = { type: 'relation_delta', targets: 'all_at_war', amount: -5 };
    const result = applyRelationDelta([n1, n2], 'n1', effect, wars);
    expect(result[0].relations.n2).toBe(-5);
  });

  it('modifies relation toward all targets', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: 0, n3: 0 } });
    const n2 = makeNation({ id: 'n2' });
    const n3 = makeNation({ id: 'n3' });
    const effect: RelationDeltaEffect = { type: 'relation_delta', targets: 'all', amount: -10 };
    const result = applyRelationDelta([n1, n2, n3], 'n1', effect, []);
    expect(result[0].relations.n2).toBe(-10);
    expect(result[0].relations.n3).toBe(-10);
  });

  it('clamps relation values', () => {
    const n1 = makeNation({ id: 'n1', relations: { n2: -95 } });
    const n2 = makeNation({ id: 'n2' });
    const effect: RelationDeltaEffect = { type: 'relation_delta', targets: 'n2', amount: -20 };
    const result = applyRelationDelta([n1, n2], 'n1', effect, []);
    expect(result[0].relations.n2).toBe(-100);
  });
});

describe('applyUnrestDelta', () => {
  it('increases unrest on owned provinces', () => {
    const provinces = [makeProvince({ ownerId: 'n1', unrest: 20 })];
    const effect: UnrestDeltaEffect = { type: 'unrest_delta', targets: 'all_owned', amount: 15 };
    const result = applyUnrestDelta(provinces, 'n1', effect);
    expect(result[0].unrest).toBe(35);
  });

  it('clamps unrest to 0-100 range', () => {
    const provinces = [makeProvince({ ownerId: 'n1', unrest: 95 })];
    const effect: UnrestDeltaEffect = { type: 'unrest_delta', targets: 'all_owned', amount: 15 };
    const result = applyUnrestDelta(provinces, 'n1', effect);
    expect(result[0].unrest).toBe(100);
  });

  it('does not affect provinces owned by others', () => {
    const provinces = [makeProvince({ ownerId: 'n2', unrest: 20 })];
    const effect: UnrestDeltaEffect = { type: 'unrest_delta', targets: 'all_owned', amount: 50 };
    const result = applyUnrestDelta(provinces, 'n1', effect);
    expect(result[0].unrest).toBe(20);
  });
});

describe('applyOwnerChange', () => {
  it('changes owner to rebel for provinces with unrest >= 100', () => {
    const provinces = [makeProvince({ ownerId: 'n1', unrest: 100 })];
    const effect: OwnerChangeEffect = { type: 'owner_change', newOwner: 'rebel' };
    const result = applyOwnerChange(provinces, 'n1', effect);
    expect(result[0].ownerId).toBe('rebel');
    expect(result[0].unrest).toBe(0);
  });

  it('does not change owner for provinces with unrest < 100', () => {
    const provinces = [makeProvince({ ownerId: 'n1', unrest: 99 })];
    const effect: OwnerChangeEffect = { type: 'owner_change', newOwner: 'rebel' };
    const result = applyOwnerChange(provinces, 'n1', effect);
    expect(result[0].ownerId).toBe('n1');
  });
});

describe('applyPopulationChange', () => {
  it('reduces population by one tier', () => {
    const provinces = [makeProvince({ ownerId: 'n1', population: 'High' })];
    const effect: PopulationChangeEffect = { type: 'population_change', targets: 'affected_provinces', change: -1 };
    const result = applyPopulationChange(provinces, 'n1', effect);
    expect(result[0].population).toBe('Medium');
  });

  it('does not reduce below Low', () => {
    const provinces = [makeProvince({ ownerId: 'n1', population: 'Low' })];
    const effect: PopulationChangeEffect = { type: 'population_change', targets: 'affected_provinces', change: -1 };
    const result = applyPopulationChange(provinces, 'n1', effect);
    expect(result[0].population).toBe('Low');
  });

  it('reduces Thriving to High', () => {
    const provinces = [makeProvince({ ownerId: 'n1', population: 'Thriving' })];
    const effect: PopulationChangeEffect = { type: 'population_change', targets: 'affected_provinces', change: -1 };
    const result = applyPopulationChange(provinces, 'n1', effect);
    expect(result[0].population).toBe('High');
  });
});

// ---------------------------------------------------------------------------
// applyEventEffects
// ---------------------------------------------------------------------------

describe('applyEventEffects', () => {
  it('applies multiple effects from a single event', () => {
    const event: GameEvent = {
      id: 'e1',
      trigger: { type: 'condition', conditions: [] },
      effects: [
        { type: 'resource_delta', resource: 'manpower', amount: -10 },
        { type: 'unrest_delta', targets: 'all_owned', amount: 5 },
      ],
      narrative: 'test event',
    };
    const province = makeProvince({ ownerId: 'n1', unrest: 10 });
    const nation = makeNation({ resources: { gold: 100, food: 50, production: 50, influence: 30, manpower: 40 } });
    const state = makeState({ nations: [nation], provinces: [province] });

    const result = applyEventEffects(state, event, 'n1');
    const updatedNation = result.nations.find((n) => n.id === 'n1')!;
    expect(updatedNation.resources.manpower).toBe(30);
    expect(result.provinces[0].unrest).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// evaluateAndApplyEvents
// ---------------------------------------------------------------------------

describe('evaluateAndApplyEvents', () => {
  it('fires events whose conditions are met and returns fired events', () => {
    const event: GameEvent = {
      id: 'rebellion',
      trigger: { type: 'condition', conditions: ['province.unrest >= 100'] },
      effects: [{ type: 'owner_change', newOwner: 'rebel' }],
      narrative: 'Rebellion!',
    };
    const province = makeProvince({ ownerId: 'n1', unrest: 100 });
    const nation = makeNation();
    const state = makeState({ nations: [nation], provinces: [province] });

    const { state: newState, firedEvents } = evaluateAndApplyEvents(state, [event]);
    expect(firedEvents).toHaveLength(1);
    expect(firedEvents[0].event.id).toBe('rebellion');
    expect(newState.provinces[0].ownerId).toBe('rebel');
  });

  it('does not fire events whose conditions are not met', () => {
    const event: GameEvent = {
      id: 'rebellion',
      trigger: { type: 'condition', conditions: ['province.unrest >= 100'] },
      effects: [{ type: 'owner_change', newOwner: 'rebel' }],
      narrative: 'Rebellion!',
    };
    const province = makeProvince({ ownerId: 'n1', unrest: 50 });
    const state = makeState({ nations: [makeNation()], provinces: [province] });

    const { firedEvents } = evaluateAndApplyEvents(state, [event]);
    expect(firedEvents).toHaveLength(0);
  });

  it('skips eliminated nations', () => {
    const event: GameEvent = {
      id: 'test',
      trigger: { type: 'condition', conditions: ['nation.resources.gold < 0'] },
      effects: [{ type: 'resource_delta', resource: 'influence', amount: -5 }],
      narrative: 'test',
    };
    const nation = makeNation({
      eliminatedOnTurn: 3,
      resources: { gold: -50, food: 0, production: 0, influence: 30, manpower: 0 },
    });
    const state = makeState({ nations: [nation] });

    const { firedEvents } = evaluateAndApplyEvents(state, [event]);
    expect(firedEvents).toHaveLength(0);
  });
});
