import { describe, it, expect } from 'vitest';
import { validateScenario, ScenarioValidationError } from './validateScenario';

// ---------------------------------------------------------------------------
// Helper — minimal valid scenario
// ---------------------------------------------------------------------------

function makeValidScenario() {
  return {
    meta: {
      id: 'test_scenario',
      name: 'Test Scenario',
      description: 'A test scenario',
      turnLimit: 40,
      victoryConditions: {
        primaryObjective: {
          type: 'control_regions',
          regions: ['p1', 'p2'],
          turnsHeld: 3,
        },
        dominationThreshold: 0.65,
        turnLimit: 40,
        tiebreaker: 'total_score',
      },
      exileWindowTurns: 5,
      exileRestoreCost: 30,
      siegeTurns: 3,
      relationDecayPerTurn: 1,
    },
    world: {
      provinces: [
        {
          id: 'p1',
          name: 'Province A',
          ownerId: null,
          terrain: 'Plains',
          devLevel: 2,
          focus: 'Agricultural',
          unrest: 0,
          fortLevel: 0,
          population: 'Medium',
          strategicTag: 'Capital',
          layout: { x: 100, y: 100, polygon: [[90, 90], [110, 90], [110, 110], [90, 110]] },
        },
        {
          id: 'p2',
          name: 'Province B',
          ownerId: null,
          terrain: 'Forest',
          devLevel: 1,
          focus: null,
          unrest: 0,
          fortLevel: 0,
          population: 'Low',
          strategicTag: 'Capital',
          layout: { x: 200, y: 100, polygon: [[190, 90], [210, 90], [210, 110], [190, 110]] },
        },
      ],
      edges: [
        {
          sourceId: 'p1',
          targetId: 'p2',
          movementCost: 1,
          tradeValue: 3,
          chokepoint: false,
          tradeActive: false,
        },
      ],
    },
    nations: [
      {
        id: 'n1',
        name: 'Kingdom A',
        color: '#c0392b',
        archetype: 'Expansionist',
        modifiers: ['Militarist'],
        agenda: { type: 'military_supremacy', priority: 'high' },
      },
      {
        id: 'n2',
        name: 'Kingdom B',
        color: '#2980b9',
        archetype: 'Trader',
        modifiers: [],
        agenda: { type: 'economic_dominance', priority: 'medium' },
      },
    ],
    startingState: {
      provinceOwnership: { p1: 'n1', p2: 'n2' },
      armies: [
        { id: 'a1', type: 'Land', strength: 10, provinceId: 'p1', ownerId: 'n1' },
      ],
      resources: {
        n1: { gold: 100, food: 50, production: 50, influence: 30, manpower: 40 },
        n2: { gold: 80, food: 40, production: 40, influence: 20, manpower: 30 },
      },
      relations: { n1_n2: 10 },
    },
    scriptedEvents: [],
    genericEvents: ['rebellion'],
  };
}

// ---------------------------------------------------------------------------
// Valid scenario
// ---------------------------------------------------------------------------

describe('validateScenario — valid input', () => {
  it('accepts a valid scenario and returns it', () => {
    const scenario = validateScenario(makeValidScenario());
    expect(scenario.meta.id).toBe('test_scenario');
    expect(scenario.world.provinces).toHaveLength(2);
    expect(scenario.nations).toHaveLength(2);
  });

  it('accepts scenario with optional developmentOutputTable', () => {
    const data = makeValidScenario();
    (data.meta as Record<string, unknown>).developmentOutputTable = {
      '1': { Agricultural: { food: 5 } },
    };
    const scenario = validateScenario(data);
    expect(scenario.meta.developmentOutputTable).toBeDefined();
  });

  it('accepts scenario with optional majorBattleThreshold', () => {
    const data = makeValidScenario();
    (data.meta as Record<string, unknown>).majorBattleThreshold = 100;
    expect(() => validateScenario(data)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Invalid scenarios — top-level structure
// ---------------------------------------------------------------------------

describe('validateScenario — invalid top-level', () => {
  it('throws for non-object input', () => {
    expect(() => validateScenario(null)).toThrow(ScenarioValidationError);
    expect(() => validateScenario('string')).toThrow(ScenarioValidationError);
    expect(() => validateScenario(42)).toThrow(ScenarioValidationError);
  });

  it('throws when meta is missing', () => {
    const data = makeValidScenario();
    delete (data as Record<string, unknown>).meta;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('throws when nations is empty', () => {
    const data = makeValidScenario();
    data.nations = [];
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// Invalid scenarios — meta
// ---------------------------------------------------------------------------

describe('validateScenario — invalid meta', () => {
  it('rejects missing meta.id', () => {
    const data = makeValidScenario();
    delete (data.meta as Record<string, unknown>).id;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects negative turnLimit', () => {
    const data = makeValidScenario();
    data.meta.turnLimit = -1;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects negative exileWindowTurns', () => {
    const data = makeValidScenario();
    data.meta.exileWindowTurns = -1;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects invalid victoryConditions.tiebreaker', () => {
    const data = makeValidScenario();
    (data.meta.victoryConditions as Record<string, unknown>).tiebreaker = 'invalid';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects dominationThreshold > 1', () => {
    const data = makeValidScenario();
    data.meta.victoryConditions.dominationThreshold = 1.5;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// Invalid scenarios — provinces
// ---------------------------------------------------------------------------

describe('validateScenario — invalid provinces', () => {
  it('rejects province with invalid terrain', () => {
    const data = makeValidScenario();
    (data.world.provinces[0] as Record<string, unknown>).terrain = 'Swamp';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects province with devLevel outside 1-5', () => {
    const data = makeValidScenario();
    (data.world.provinces[0] as Record<string, unknown>).devLevel = 6;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects devLevel 1 with non-null focus', () => {
    const data = makeValidScenario();
    data.world.provinces[1].focus = 'Agricultural' as never;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects devLevel >= 2 with null focus', () => {
    const data = makeValidScenario();
    (data.world.provinces[0] as Record<string, unknown>).focus = null;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects province with invalid population', () => {
    const data = makeValidScenario();
    (data.world.provinces[0] as Record<string, unknown>).population = 'Huge';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects duplicate province ids', () => {
    const data = makeValidScenario();
    data.world.provinces[1].id = 'p1'; // duplicate
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects province with unrest > 100', () => {
    const data = makeValidScenario();
    (data.world.provinces[0] as Record<string, unknown>).unrest = 150;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects province with fortLevel > 3', () => {
    const data = makeValidScenario();
    (data.world.provinces[0] as Record<string, unknown>).fortLevel = 5;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects province with missing layout', () => {
    const data = makeValidScenario();
    delete (data.world.provinces[0] as Record<string, unknown>).layout;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// Invalid scenarios — edges
// ---------------------------------------------------------------------------

describe('validateScenario — invalid edges', () => {
  it('rejects edge referencing non-existent province', () => {
    const data = makeValidScenario();
    data.world.edges[0].sourceId = 'nonexistent';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects edge where sourceId equals targetId', () => {
    const data = makeValidScenario();
    data.world.edges[0].targetId = data.world.edges[0].sourceId;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects edge with movementCost < 1', () => {
    const data = makeValidScenario();
    data.world.edges[0].movementCost = 0;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects duplicate edges', () => {
    const data = makeValidScenario();
    data.world.edges.push({ ...data.world.edges[0] });
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// Invalid scenarios — nations
// ---------------------------------------------------------------------------

describe('validateScenario — invalid nations', () => {
  it('rejects nation with invalid archetype', () => {
    const data = makeValidScenario();
    (data.nations[0] as Record<string, unknown>).archetype = 'Pirate';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects nation with > 2 modifiers', () => {
    const data = makeValidScenario();
    (data.nations[0] as Record<string, unknown>).modifiers = ['Militarist', 'Paranoid', 'Opportunist'];
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects nation with invalid modifier', () => {
    const data = makeValidScenario();
    (data.nations[0] as Record<string, unknown>).modifiers = ['InvalidMod'];
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects nation with invalid color format', () => {
    const data = makeValidScenario();
    (data.nations[0] as Record<string, unknown>).color = 'red';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects duplicate nation ids', () => {
    const data = makeValidScenario();
    data.nations[1].id = 'n1'; // duplicate
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects nation with invalid agenda type', () => {
    const data = makeValidScenario();
    (data.nations[0].agenda as Record<string, unknown>).type = 'world_domination';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// Invalid scenarios — starting state
// ---------------------------------------------------------------------------

describe('validateScenario — invalid starting state', () => {
  it('rejects army referencing non-existent province', () => {
    const data = makeValidScenario();
    data.startingState.armies[0].provinceId = 'nonexistent';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects army referencing non-existent nation', () => {
    const data = makeValidScenario();
    data.startingState.armies[0].ownerId = 'nonexistent';
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects missing resources for a nation', () => {
    const data = makeValidScenario();
    delete (data.startingState.resources as Record<string, unknown>).n2;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects relations outside -100 to 100', () => {
    const data = makeValidScenario();
    data.startingState.relations.n1_n2 = 200;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// Cross-reference validations
// ---------------------------------------------------------------------------

describe('validateScenario — cross-references', () => {
  it('rejects victory condition regions that are not valid province IDs', () => {
    const data = makeValidScenario();
    data.meta.victoryConditions.primaryObjective.regions = ['nonexistent'];
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });

  it('rejects nation without a Capital province', () => {
    const data = makeValidScenario();
    // Remove Capital tag from p1 (owned by n1)
    (data.world.provinces[0] as Record<string, unknown>).strategicTag = null;
    expect(() => validateScenario(data)).toThrow(ScenarioValidationError);
  });
});

// ---------------------------------------------------------------------------
// ScenarioValidationError structure
// ---------------------------------------------------------------------------

describe('ScenarioValidationError', () => {
  it('contains an array of error messages', () => {
    try {
      validateScenario({});
    } catch (e) {
      expect(e).toBeInstanceOf(ScenarioValidationError);
      const err = e as ScenarioValidationError;
      expect(err.errors).toBeInstanceOf(Array);
      expect(err.errors.length).toBeGreaterThan(0);
    }
  });

  it('has the name ScenarioValidationError', () => {
    const err = new ScenarioValidationError(['test error']);
    expect(err.name).toBe('ScenarioValidationError');
  });
});
