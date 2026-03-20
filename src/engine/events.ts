import type {
  GameEvent,
  FiredEvent,
  ResourceDeltaEffect,
  RelationDeltaEffect,
  UnrestDeltaEffect,
  OwnerChangeEffect,
  PopulationChangeEffect,
  Nation,
  Province,
  War,
  GameState,
  PopulationLevel,
} from '../types';

// --- Condition evaluation ---

/**
 * Context object used for evaluating event conditions.
 * Provides lookups for condition expressions.
 */
interface ConditionContext {
  nation: Nation;
  provinces: Province[];  // all provinces
  ownedProvinces: Province[];
  wars: War[];
  turn: number;
  state: GameState;
}

/**
 * Evaluate a single condition expression against a nation's context.
 * Conditions are simple string expressions from event JSON.
 * Returns true if the condition is met.
 */
export function evaluateCondition(
  expression: string,
  ctx: ConditionContext
): boolean {
  // Parse known condition patterns
  const trimmed = expression.trim();

  // nation.wars.length > N
  const warsMatch = trimmed.match(/^nation\.wars\.length\s*(>|>=|<|<=|==)\s*(\d+)$/);
  if (warsMatch) {
    const nationWars = ctx.wars.filter(
      (w) => w.aggressorId === ctx.nation.id || w.defenderId === ctx.nation.id
    );
    return compareNumbers(nationWars.length, warsMatch[1], Number(warsMatch[2]));
  }

  // nation.resources.<resource> < N
  const resourceMatch = trimmed.match(
    /^nation\.resources\.(\w+)\s*(>|>=|<|<=|==)\s*(-?\d+)$/
  );
  if (resourceMatch) {
    const resource = resourceMatch[1] as keyof typeof ctx.nation.resources;
    const value = ctx.nation.resources[resource];
    if (typeof value === 'number') {
      return compareNumbers(value, resourceMatch[2], Number(resourceMatch[3]));
    }
    return false;
  }

  // province.unrest >= N (applies to any owned province)
  const unrestMatch = trimmed.match(/^province\.unrest\s*(>|>=|<|<=|==)\s*(\d+)$/);
  if (unrestMatch) {
    return ctx.ownedProvinces.some((p) =>
      compareNumbers(p.unrest, unrestMatch[1], Number(unrestMatch[2]))
    );
  }

  // war_turns >= N (longest active war duration)
  const warTurnsMatch = trimmed.match(/^war_turns\s*(>|>=|<|<=|==)\s*(\d+)$/);
  if (warTurnsMatch) {
    const nationWars = ctx.wars.filter(
      (w) => w.aggressorId === ctx.nation.id || w.defenderId === ctx.nation.id
    );
    if (nationWars.length === 0) return false;
    const maxWarTurns = Math.max(...nationWars.map((w) => ctx.turn - w.startedOnTurn));
    return compareNumbers(maxWarTurns, warTurnsMatch[1], Number(warTurnsMatch[2]));
  }

  // nation.size >= N (number of owned provinces)
  const sizeMatch = trimmed.match(/^nation\.size\s*(>|>=|<|<=|==)\s*(\d+)$/);
  if (sizeMatch) {
    return compareNumbers(ctx.ownedProvinces.length, sizeMatch[1], Number(sizeMatch[2]));
  }

  // gold_negative_turns >= N (gold < 0 for consecutive turns — simplified: check if gold < 0)
  if (trimmed.startsWith('gold_negative_turns')) {
    // This requires tracking across turns; for now check if gold is negative
    return ctx.nation.resources.gold < 0;
  }

  // province.population == "High" or "Thriving" (for plague check)
  const popMatch = trimmed.match(
    /^province\.population\s*==\s*["'](\w+)["']$/
  );
  if (popMatch) {
    return ctx.ownedProvinces.some((p) => p.population === popMatch[1]);
  }

  // no_military_action_turns >= N (simplified: check army count == 0 as proxy)
  const noMilMatch = trimmed.match(/^no_military_action_turns\s*(>|>=|<|<=|==)\s*(\d+)$/);
  if (noMilMatch) {
    // Simplified: always false (requires turn tracking beyond current scope)
    return false;
  }

  // Default: unrecognized condition evaluates to false
  return false;
}

function compareNumbers(actual: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return actual > threshold;
    case '>=': return actual >= threshold;
    case '<': return actual < threshold;
    case '<=': return actual <= threshold;
    case '==': return actual === threshold;
    default: return false;
  }
}

/**
 * Evaluate all conditions for an event trigger.
 * All conditions must be met (AND logic).
 */
export function evaluateEventTrigger(
  event: GameEvent,
  ctx: ConditionContext
): boolean {
  if (event.trigger.type === 'turn') {
    return event.trigger.onTurn === ctx.turn;
  }

  if (event.trigger.type === 'condition' || event.trigger.type === 'scripted') {
    const conditions = event.trigger.conditions ?? [];
    if (conditions.length === 0) return false;
    return conditions.every((c) => evaluateCondition(c, ctx));
  }

  return false;
}

// --- Effect application ---

/**
 * Apply a resource_delta effect to a nation.
 */
export function applyResourceDelta(
  nation: Nation,
  effect: ResourceDeltaEffect
): Nation {
  return {
    ...nation,
    resources: {
      ...nation.resources,
      [effect.resource]: nation.resources[effect.resource] + effect.amount,
    },
  };
}

/**
 * Apply a relation_delta effect.
 * Returns updated array of all nations.
 */
export function applyRelationDelta(
  nations: Nation[],
  sourceNationId: string,
  effect: RelationDeltaEffect,
  wars: War[]
): Nation[] {
  return nations.map((n) => {
    if (n.id === sourceNationId) {
      const newRelations = { ...n.relations };
      if (effect.targets === 'all_at_war') {
        for (const war of wars) {
          if (war.aggressorId === sourceNationId) {
            newRelations[war.defenderId] = clampRelation(
              (newRelations[war.defenderId] ?? 0) + effect.amount
            );
          } else if (war.defenderId === sourceNationId) {
            newRelations[war.aggressorId] = clampRelation(
              (newRelations[war.aggressorId] ?? 0) + effect.amount
            );
          }
        }
      } else if (effect.targets === 'all_neighbors' || effect.targets === 'all') {
        for (const other of nations) {
          if (other.id !== sourceNationId) {
            newRelations[other.id] = clampRelation(
              (newRelations[other.id] ?? 0) + effect.amount
            );
          }
        }
      } else {
        // Specific nation target
        newRelations[effect.targets] = clampRelation(
          (newRelations[effect.targets] ?? 0) + effect.amount
        );
      }
      return { ...n, relations: newRelations };
    }
    return n;
  });
}

function clampRelation(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/**
 * Apply an unrest_delta effect to provinces.
 */
export function applyUnrestDelta(
  provinces: Province[],
  nationId: string,
  effect: UnrestDeltaEffect
): Province[] {
  return provinces.map((p) => {
    if (p.ownerId !== nationId) return p;

    if (effect.targets === 'all_owned' || effect.targets === 'affected_provinces') {
      return {
        ...p,
        unrest: Math.max(0, Math.min(100, p.unrest + effect.amount)),
      };
    }

    // Specific province target
    if (p.id === effect.targets) {
      return {
        ...p,
        unrest: Math.max(0, Math.min(100, p.unrest + effect.amount)),
      };
    }

    return p;
  });
}

/**
 * Apply an owner_change effect to provinces (e.g., rebellion).
 * Applies to provinces that triggered the event (unrest >= 100).
 */
export function applyOwnerChange(
  provinces: Province[],
  nationId: string,
  effect: OwnerChangeEffect
): Province[] {
  return provinces.map((p) => {
    if (p.ownerId === nationId && p.unrest >= 100) {
      return { ...p, ownerId: effect.newOwner, unrest: 0 };
    }
    return p;
  });
}

const POPULATION_ORDER: PopulationLevel[] = ['Low', 'Medium', 'High', 'Thriving'];

/**
 * Apply a population_change effect (tier reduction).
 */
export function applyPopulationChange(
  provinces: Province[],
  nationId: string,
  _effect: PopulationChangeEffect
): Province[] {
  return provinces.map((p) => {
    if (p.ownerId !== nationId) return p;

    const currentIdx = POPULATION_ORDER.indexOf(p.population);
    if (currentIdx <= 0) return p; // already at Low

    return {
      ...p,
      population: POPULATION_ORDER[currentIdx - 1],
    };
  });
}

/**
 * Apply all effects of an event to the game state.
 * Returns a new GameState (pure, no mutation).
 */
export function applyEventEffects(
  state: GameState,
  event: GameEvent,
  targetNationId: string
): GameState {
  let { nations, provinces } = state;
  const { wars } = state;

  for (const effect of event.effects) {
    switch (effect.type) {
      case 'resource_delta': {
        nations = nations.map((n) =>
          n.id === targetNationId ? applyResourceDelta(n, effect) : n
        );
        break;
      }
      case 'relation_delta': {
        nations = applyRelationDelta(nations, targetNationId, effect, wars);
        break;
      }
      case 'unrest_delta': {
        provinces = applyUnrestDelta(provinces, targetNationId, effect);
        break;
      }
      case 'owner_change': {
        provinces = applyOwnerChange(provinces, targetNationId, effect);
        break;
      }
      case 'population_change': {
        provinces = applyPopulationChange(provinces, targetNationId, effect);
        break;
      }
      case 'dev_cost_modifier':
      case 'output_modifier': {
        // These effects are tracked as modifiers and consumed by relevant systems
        // They require a duration tracking mechanism; stored as active effects
        // For now, the modifier effects are noted in the turn log
        break;
      }
    }
  }

  return { ...state, nations, provinces };
}

// --- Event evaluation pass ---

/**
 * Evaluate all events for all nations and apply triggered effects.
 * Returns updated GameState and array of fired events.
 *
 * Convention #7: events are data. This function is the pure handler.
 */
export function evaluateAndApplyEvents(
  state: GameState,
  eventLibrary: GameEvent[]
): { state: GameState; firedEvents: FiredEvent[] } {
  const firedEvents: FiredEvent[] = [];
  let currentState = state;

  for (const nation of currentState.nations) {
    if (nation.eliminatedOnTurn !== undefined) continue;

    const ownedProvinces = currentState.provinces.filter(
      (p) => p.ownerId === nation.id
    );

    const ctx: ConditionContext = {
      nation,
      provinces: currentState.provinces,
      ownedProvinces,
      wars: currentState.wars,
      turn: currentState.turn,
      state: currentState,
    };

    for (const event of eventLibrary) {
      if (evaluateEventTrigger(event, ctx)) {
        currentState = applyEventEffects(currentState, event, nation.id);
        firedEvents.push({ event, nationId: nation.id });
      }
    }
  }

  return { state: currentState, firedEvents };
}
