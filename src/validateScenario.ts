import type {
  Scenario,
  ScenarioMeta,
  Province,
  Edge,
  NationDefinition,
  StartingState,
  ArmyDefinition,
  VictoryConditions,
  GameEvent,
  EventEffect,
  DevelopmentOutputTable,
  Agenda,
  TerrainType,
  ProvinceFocus,
  StrategicTag,
  PopulationLevel,
  DevLevel,
  Archetype,
  Modifier,
} from './types';

// --- Validation error accumulator ---

export class ScenarioValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Scenario validation failed:\n  - ${errors.join('\n  - ')}`);
    this.name = 'ScenarioValidationError';
    this.errors = errors;
  }
}

// --- Allowed value sets ---

const TERRAIN_TYPES: TerrainType[] = ['Plains', 'Forest', 'Mountain', 'Coastal', 'Desert'];
const PROVINCE_FOCUSES: ProvinceFocus[] = ['Agricultural', 'Industrial', 'Commercial', 'Military'];
const STRATEGIC_TAGS: StrategicTag[] = ['Capital', 'KeyRegion', 'Port'];
const POPULATION_LEVELS: PopulationLevel[] = ['Low', 'Medium', 'High', 'Thriving'];
const DEV_LEVELS: DevLevel[] = [1, 2, 3, 4, 5];
const ARCHETYPES: Archetype[] = ['Expansionist', 'Trader', 'Isolationist', 'Hegemon'];
const MODIFIERS: Modifier[] = ['Opportunist', 'Paranoid', 'Honorable', 'NavalFocus', 'Grudgeholder', 'Militarist'];
const AGENDA_TYPES = ['control_region_cluster', 'economic_dominance', 'military_supremacy', 'diplomatic_hegemony'];
const AGENDA_PRIORITIES = ['low', 'medium', 'high'];
const ARMY_TYPES = ['Land', 'Naval'];
const EVENT_TRIGGER_TYPES = ['condition', 'turn', 'scripted'];
const EVENT_EFFECT_TYPES = [
  'resource_delta', 'relation_delta', 'unrest_delta',
  'owner_change', 'population_change', 'dev_cost_modifier', 'output_modifier',
];
const RESOURCE_TYPES = ['gold', 'food', 'production', 'influence', 'manpower'];

// --- Helper validators ---

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && !isNaN(val);
}

function isArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

// --- Field-level validators ---

function validateMeta(meta: unknown, errors: string[]): meta is ScenarioMeta {
  if (!isObject(meta)) {
    errors.push('meta: must be an object');
    return false;
  }

  if (!isString(meta.id) || meta.id.length === 0) errors.push('meta.id: must be a non-empty string');
  if (!isString(meta.name) || meta.name.length === 0) errors.push('meta.name: must be a non-empty string');
  if (!isString(meta.description)) errors.push('meta.description: must be a string');
  if (!isNumber(meta.turnLimit) || meta.turnLimit < 1) errors.push('meta.turnLimit: must be a positive number');
  if (!isNumber(meta.exileWindowTurns) || meta.exileWindowTurns < 0) errors.push('meta.exileWindowTurns: must be a non-negative number');
  if (!isNumber(meta.exileRestoreCost) || meta.exileRestoreCost < 0) errors.push('meta.exileRestoreCost: must be a non-negative number');
  if (!isNumber(meta.siegeTurns) || meta.siegeTurns < 1) errors.push('meta.siegeTurns: must be a positive number');
  if (!isNumber(meta.relationDecayPerTurn) || meta.relationDecayPerTurn < 0) errors.push('meta.relationDecayPerTurn: must be a non-negative number');

  if (meta.majorBattleThreshold !== undefined && !isNumber(meta.majorBattleThreshold)) {
    errors.push('meta.majorBattleThreshold: must be a number if provided');
  }

  validateVictoryConditions(meta.victoryConditions, errors);

  if (meta.developmentOutputTable !== undefined) {
    validateDevelopmentOutputTable(meta.developmentOutputTable, errors);
  }

  return true;
}

function validateVictoryConditions(vc: unknown, errors: string[]): vc is VictoryConditions {
  if (!isObject(vc)) {
    errors.push('meta.victoryConditions: must be an object');
    return false;
  }

  // primaryObjective
  if (!isObject(vc.primaryObjective)) {
    errors.push('meta.victoryConditions.primaryObjective: must be an object');
  } else {
    const obj = vc.primaryObjective;
    if (obj.type === 'control_regions') {
      if (!isArray(obj.regions) || obj.regions.length === 0) {
        errors.push('victoryConditions.primaryObjective.regions: must be a non-empty array of strings');
      } else if (!obj.regions.every(isString)) {
        errors.push('victoryConditions.primaryObjective.regions: all entries must be strings');
      }
      if (!isNumber(obj.turnsHeld) || obj.turnsHeld < 1) {
        errors.push('victoryConditions.primaryObjective.turnsHeld: must be a positive number');
      }
    } else if (obj.type === 'domination') {
      if (!isNumber(obj.threshold) || obj.threshold <= 0 || obj.threshold > 1) {
        errors.push('victoryConditions.primaryObjective.threshold: must be a number between 0 and 1');
      }
    } else {
      errors.push(`victoryConditions.primaryObjective.type: must be "control_regions" or "domination", got "${String(obj.type)}"`);
    }
  }

  if (!isNumber(vc.dominationThreshold) || vc.dominationThreshold <= 0 || vc.dominationThreshold > 1) {
    errors.push('meta.victoryConditions.dominationThreshold: must be a number between 0 and 1');
  }
  if (!isNumber(vc.turnLimit) || vc.turnLimit < 1) {
    errors.push('meta.victoryConditions.turnLimit: must be a positive number');
  }
  if (vc.tiebreaker !== 'total_score') {
    errors.push('meta.victoryConditions.tiebreaker: must be "total_score"');
  }

  return true;
}

function validateDevelopmentOutputTable(table: unknown, errors: string[]): table is DevelopmentOutputTable {
  if (!isObject(table)) {
    errors.push('meta.developmentOutputTable: must be an object if provided');
    return false;
  }

  for (const devKey of ['1', '2', '3', '4', '5']) {
    if (!(devKey in table)) continue;
    const focusRow = table[devKey];
    if (!isObject(focusRow)) {
      errors.push(`meta.developmentOutputTable["${devKey}"]: must be an object`);
      continue;
    }
    for (const focusKey of Object.keys(focusRow)) {
      if (!PROVINCE_FOCUSES.includes(focusKey as ProvinceFocus)) {
        errors.push(`meta.developmentOutputTable["${devKey}"]["${focusKey}"]: invalid focus type`);
        continue;
      }
      const row = focusRow[focusKey];
      if (!isObject(row)) {
        errors.push(`meta.developmentOutputTable["${devKey}"]["${focusKey}"]: must be an object`);
        continue;
      }
      for (const key of Object.keys(row)) {
        if (!RESOURCE_TYPES.includes(key)) {
          errors.push(`meta.developmentOutputTable output key "${key}": must be a valid resource type`);
        } else if (!isNumber(row[key])) {
          errors.push(`meta.developmentOutputTable["${devKey}"]["${focusKey}"].${key}: must be a number`);
        }
      }
    }
  }

  return true;
}

function validateProvince(p: unknown, index: number, errors: string[]): p is Province {
  const prefix = `world.provinces[${index}]`;
  if (!isObject(p)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  if (!isString(p.id) || p.id.length === 0) errors.push(`${prefix}.id: must be a non-empty string`);
  if (!isString(p.name) || p.name.length === 0) errors.push(`${prefix}.name: must be a non-empty string`);

  if (p.ownerId !== null && !isString(p.ownerId)) {
    errors.push(`${prefix}.ownerId: must be a string or null`);
  }

  if (!TERRAIN_TYPES.includes(p.terrain as TerrainType)) {
    errors.push(`${prefix}.terrain: must be one of ${TERRAIN_TYPES.join(', ')}`);
  }

  if (!DEV_LEVELS.includes(p.devLevel as DevLevel)) {
    errors.push(`${prefix}.devLevel: must be 1-5`);
  }

  if (p.focus !== null && !PROVINCE_FOCUSES.includes(p.focus as ProvinceFocus)) {
    errors.push(`${prefix}.focus: must be null or one of ${PROVINCE_FOCUSES.join(', ')}`);
  }

  // devLevel 1 should have null focus
  if (p.devLevel === 1 && p.focus !== null) {
    errors.push(`${prefix}.focus: must be null at devLevel 1`);
  }

  // devLevel >= 2 should have a focus
  if (isNumber(p.devLevel) && p.devLevel >= 2 && p.focus === null) {
    errors.push(`${prefix}.focus: must be set at devLevel >= 2`);
  }

  if (!isNumber(p.unrest) || p.unrest < 0 || p.unrest > 100) {
    errors.push(`${prefix}.unrest: must be a number 0-100`);
  }

  if (!isNumber(p.fortLevel) || p.fortLevel < 0 || p.fortLevel > 3) {
    errors.push(`${prefix}.fortLevel: must be 0-3`);
  }

  if (!POPULATION_LEVELS.includes(p.population as PopulationLevel)) {
    errors.push(`${prefix}.population: must be one of ${POPULATION_LEVELS.join(', ')}`);
  }

  if (p.strategicTag !== null && !STRATEGIC_TAGS.includes(p.strategicTag as StrategicTag)) {
    errors.push(`${prefix}.strategicTag: must be null or one of ${STRATEGIC_TAGS.join(', ')}`);
  }

  // Layout validation
  if (!isObject(p.layout)) {
    errors.push(`${prefix}.layout: must be an object with x, y, polygon`);
  } else {
    if (!isNumber(p.layout.x)) errors.push(`${prefix}.layout.x: must be a number`);
    if (!isNumber(p.layout.y)) errors.push(`${prefix}.layout.y: must be a number`);
    if (!isArray(p.layout.polygon) || p.layout.polygon.length < 3) {
      errors.push(`${prefix}.layout.polygon: must be an array of at least 3 [x,y] pairs`);
    } else {
      for (let i = 0; i < p.layout.polygon.length; i++) {
        const pt = p.layout.polygon[i];
        if (!isArray(pt) || pt.length !== 2 || !isNumber(pt[0]) || !isNumber(pt[1])) {
          errors.push(`${prefix}.layout.polygon[${i}]: must be a [number, number] pair`);
        }
      }
    }
  }

  return true;
}

function validateEdge(e: unknown, index: number, provinceIds: Set<string>, errors: string[]): e is Edge {
  const prefix = `world.edges[${index}]`;
  if (!isObject(e)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  if (!isString(e.sourceId)) {
    errors.push(`${prefix}.sourceId: must be a string`);
  } else if (!provinceIds.has(e.sourceId)) {
    errors.push(`${prefix}.sourceId: "${e.sourceId}" does not reference a valid province`);
  }

  if (!isString(e.targetId)) {
    errors.push(`${prefix}.targetId: must be a string`);
  } else if (!provinceIds.has(e.targetId)) {
    errors.push(`${prefix}.targetId: "${e.targetId}" does not reference a valid province`);
  }

  if (isString(e.sourceId) && isString(e.targetId) && e.sourceId === e.targetId) {
    errors.push(`${prefix}: sourceId and targetId cannot be the same`);
  }

  if (!isNumber(e.movementCost) || e.movementCost < 1) {
    errors.push(`${prefix}.movementCost: must be a positive number`);
  }
  if (!isNumber(e.tradeValue) || e.tradeValue < 0) {
    errors.push(`${prefix}.tradeValue: must be a non-negative number`);
  }
  if (typeof e.chokepoint !== 'boolean') {
    errors.push(`${prefix}.chokepoint: must be a boolean`);
  }
  if (typeof e.tradeActive !== 'boolean') {
    errors.push(`${prefix}.tradeActive: must be a boolean`);
  }

  return true;
}

function validateAgenda(agenda: unknown, prefix: string, errors: string[]): agenda is Agenda {
  if (!isObject(agenda)) {
    errors.push(`${prefix}.agenda: must be an object`);
    return false;
  }

  if (!AGENDA_TYPES.includes(agenda.type as string)) {
    errors.push(`${prefix}.agenda.type: must be one of ${AGENDA_TYPES.join(', ')}`);
  }

  if (agenda.targetRegions !== undefined) {
    if (!isArray(agenda.targetRegions) || !agenda.targetRegions.every(isString)) {
      errors.push(`${prefix}.agenda.targetRegions: must be an array of strings if provided`);
    }
  }

  if (!AGENDA_PRIORITIES.includes(agenda.priority as string)) {
    errors.push(`${prefix}.agenda.priority: must be one of ${AGENDA_PRIORITIES.join(', ')}`);
  }

  return true;
}

function validateNationDef(n: unknown, index: number, errors: string[]): n is NationDefinition {
  const prefix = `nations[${index}]`;
  if (!isObject(n)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  if (!isString(n.id) || n.id.length === 0) errors.push(`${prefix}.id: must be a non-empty string`);
  if (!isString(n.name) || n.name.length === 0) errors.push(`${prefix}.name: must be a non-empty string`);

  if (!isString(n.color) || !/^#[0-9a-fA-F]{6}$/.test(n.color)) {
    errors.push(`${prefix}.color: must be a hex color string (e.g. "#c0392b")`);
  }

  if (!ARCHETYPES.includes(n.archetype as Archetype)) {
    errors.push(`${prefix}.archetype: must be one of ${ARCHETYPES.join(', ')}`);
  }

  if (!isArray(n.modifiers)) {
    errors.push(`${prefix}.modifiers: must be an array`);
  } else {
    if (n.modifiers.length > 2) {
      errors.push(`${prefix}.modifiers: maximum 2 modifiers allowed`);
    }
    for (const mod of n.modifiers) {
      if (!MODIFIERS.includes(mod as Modifier)) {
        errors.push(`${prefix}.modifiers: "${String(mod)}" is not a valid modifier`);
      }
    }
  }

  validateAgenda(n.agenda, prefix, errors);

  return true;
}

function validateStartingState(
  ss: unknown,
  provinceIds: Set<string>,
  nationIds: Set<string>,
  errors: string[]
): ss is StartingState {
  if (!isObject(ss)) {
    errors.push('startingState: must be an object');
    return false;
  }

  // provinceOwnership
  if (!isObject(ss.provinceOwnership)) {
    errors.push('startingState.provinceOwnership: must be an object');
  } else {
    for (const [pId, nId] of Object.entries(ss.provinceOwnership)) {
      if (!provinceIds.has(pId)) {
        errors.push(`startingState.provinceOwnership: province "${pId}" not found in world.provinces`);
      }
      if (!isString(nId) || (!nationIds.has(nId) && nId !== 'rebel')) {
        errors.push(`startingState.provinceOwnership["${pId}"]: nation "${String(nId)}" not found in nations`);
      }
    }
  }

  // armies
  if (!isArray(ss.armies)) {
    errors.push('startingState.armies: must be an array');
  } else {
    for (let i = 0; i < ss.armies.length; i++) {
      validateArmyDef(ss.armies[i], i, provinceIds, nationIds, errors);
    }
  }

  // resources
  if (!isObject(ss.resources)) {
    errors.push('startingState.resources: must be an object');
  } else {
    for (const [nId, ledger] of Object.entries(ss.resources)) {
      if (!nationIds.has(nId)) {
        errors.push(`startingState.resources: nation "${nId}" not found in nations`);
      }
      if (!isObject(ledger)) {
        errors.push(`startingState.resources["${nId}"]: must be a ResourceLedger object`);
      } else {
        for (const res of RESOURCE_TYPES) {
          if (!isNumber((ledger as Record<string, unknown>)[res])) {
            errors.push(`startingState.resources["${nId}"].${res}: must be a number`);
          }
        }
      }
    }
    // Ensure every nation has starting resources
    for (const nId of nationIds) {
      if (!(nId in (ss.resources as Record<string, unknown>))) {
        errors.push(`startingState.resources: missing entry for nation "${nId}"`);
      }
    }
  }

  // relations
  if (!isObject(ss.relations)) {
    errors.push('startingState.relations: must be an object');
  } else {
    for (const [key, value] of Object.entries(ss.relations)) {
      if (!isNumber(value) || value < -100 || value > 100) {
        errors.push(`startingState.relations["${key}"]: must be a number between -100 and 100`);
      }
      // Key format: "n01_n02"
      const parts = key.split('_');
      if (parts.length < 2) {
        errors.push(`startingState.relations: key "${key}" must be in "nationId_nationId" format`);
      }
    }
  }

  return true;
}

function validateArmyDef(
  a: unknown,
  index: number,
  provinceIds: Set<string>,
  nationIds: Set<string>,
  errors: string[]
): a is ArmyDefinition {
  const prefix = `startingState.armies[${index}]`;
  if (!isObject(a)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  if (!isString(a.id) || a.id.length === 0) errors.push(`${prefix}.id: must be a non-empty string`);

  if (!ARMY_TYPES.includes(a.type as string)) {
    errors.push(`${prefix}.type: must be "Land" or "Naval"`);
  }

  if (!isNumber(a.strength) || a.strength < 1) {
    errors.push(`${prefix}.strength: must be a positive number`);
  }

  if (!isString(a.provinceId) || !provinceIds.has(a.provinceId)) {
    errors.push(`${prefix}.provinceId: "${String(a.provinceId)}" not found in world.provinces`);
  }

  if (!isString(a.ownerId) || !nationIds.has(a.ownerId)) {
    errors.push(`${prefix}.ownerId: "${String(a.ownerId)}" not found in nations`);
  }

  return true;
}

function validateEventEffect(effect: unknown, prefix: string, errors: string[]): effect is EventEffect {
  if (!isObject(effect)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  if (!EVENT_EFFECT_TYPES.includes(effect.type as string)) {
    errors.push(`${prefix}.type: must be one of ${EVENT_EFFECT_TYPES.join(', ')}`);
    return false;
  }

  switch (effect.type) {
    case 'resource_delta':
      if (!RESOURCE_TYPES.includes(effect.resource as string)) {
        errors.push(`${prefix}.resource: must be one of ${RESOURCE_TYPES.join(', ')}`);
      }
      if (!isNumber(effect.amount)) errors.push(`${prefix}.amount: must be a number`);
      break;
    case 'relation_delta':
      if (!isString(effect.targets)) errors.push(`${prefix}.targets: must be a string`);
      if (!isNumber(effect.amount)) errors.push(`${prefix}.amount: must be a number`);
      break;
    case 'unrest_delta':
      if (!isString(effect.targets)) errors.push(`${prefix}.targets: must be a string`);
      if (!isNumber(effect.amount)) errors.push(`${prefix}.amount: must be a number`);
      break;
    case 'owner_change':
      if (!isString(effect.newOwner)) errors.push(`${prefix}.newOwner: must be a string`);
      break;
    case 'population_change':
      if (effect.targets !== 'affected_provinces') errors.push(`${prefix}.targets: must be "affected_provinces"`);
      if (effect.change !== -1) errors.push(`${prefix}.change: must be -1`);
      break;
    case 'dev_cost_modifier':
      if (!isNumber(effect.multiplier)) errors.push(`${prefix}.multiplier: must be a number`);
      if (!isNumber(effect.durationTurns)) errors.push(`${prefix}.durationTurns: must be a number`);
      break;
    case 'output_modifier':
      if (!isNumber(effect.multiplier)) errors.push(`${prefix}.multiplier: must be a number`);
      if (!isNumber(effect.durationTurns)) errors.push(`${prefix}.durationTurns: must be a number`);
      break;
  }

  return true;
}

function validateGameEvent(event: unknown, index: number, prefix: string, errors: string[]): event is GameEvent {
  const ep = `${prefix}[${index}]`;
  if (!isObject(event)) {
    errors.push(`${ep}: must be an object`);
    return false;
  }

  if (!isString(event.id) || event.id.length === 0) errors.push(`${ep}.id: must be a non-empty string`);
  if (!isString(event.narrative)) errors.push(`${ep}.narrative: must be a string`);

  // trigger
  if (!isObject(event.trigger)) {
    errors.push(`${ep}.trigger: must be an object`);
  } else {
    const trigger = event.trigger as Record<string, unknown>;
    if (!EVENT_TRIGGER_TYPES.includes(trigger.type as string)) {
      errors.push(`${ep}.trigger.type: must be one of ${EVENT_TRIGGER_TYPES.join(', ')}`);
    }
    if (trigger.type === 'condition' || trigger.type === 'scripted') {
      if (trigger.conditions !== undefined) {
        if (!isArray(trigger.conditions) || !trigger.conditions.every(isString)) {
          errors.push(`${ep}.trigger.conditions: must be an array of strings`);
        }
      }
    }
    if (trigger.type === 'turn') {
      if (!isNumber(trigger.onTurn) || trigger.onTurn < 1) {
        errors.push(`${ep}.trigger.onTurn: must be a positive number for turn-triggered events`);
      }
    }
  }

  // effects
  if (!isArray(event.effects)) {
    errors.push(`${ep}.effects: must be an array`);
  } else {
    for (let i = 0; i < event.effects.length; i++) {
      validateEventEffect(event.effects[i], `${ep}.effects[${i}]`, errors);
    }
  }

  return true;
}

// --- Main validation function ---

/**
 * Validate a scenario JSON object against all TypeScript interface requirements.
 * Performs both schema validation and cross-reference integrity checks.
 * Throws ScenarioValidationError with all accumulated errors if validation fails.
 * Returns the validated Scenario object if valid.
 */
export function validateScenario(json: unknown): Scenario {
  const errors: string[] = [];

  if (!isObject(json)) {
    throw new ScenarioValidationError(['Root: scenario must be an object']);
  }

  // --- Top-level structure ---

  validateMeta(json.meta, errors);

  if (!isObject(json.world)) {
    errors.push('world: must be an object');
  }

  if (!isArray(json.nations) || json.nations.length === 0) {
    errors.push('nations: must be a non-empty array');
  }

  if (!isObject(json.startingState)) {
    errors.push('startingState: must be an object');
  }

  if (!isArray(json.scriptedEvents)) {
    errors.push('scriptedEvents: must be an array');
  }

  if (!isArray(json.genericEvents)) {
    errors.push('genericEvents: must be an array of strings');
  } else if (!json.genericEvents.every(isString)) {
    errors.push('genericEvents: all entries must be strings');
  }

  // Early bail if top-level structure is broken
  if (errors.length > 0 && (!isObject(json.world) || !isArray(json.nations))) {
    throw new ScenarioValidationError(errors);
  }

  // --- Provinces ---

  const world = json.world as Record<string, unknown>;
  const provinceIds = new Set<string>();

  if (!isArray(world.provinces) || world.provinces.length === 0) {
    errors.push('world.provinces: must be a non-empty array');
  } else {
    for (let i = 0; i < world.provinces.length; i++) {
      validateProvince(world.provinces[i], i, errors);
      const p = world.provinces[i] as Record<string, unknown>;
      if (isString(p.id)) {
        if (provinceIds.has(p.id)) {
          errors.push(`world.provinces[${i}].id: duplicate province id "${p.id}"`);
        }
        provinceIds.add(p.id);
      }
    }
  }

  // --- Edges ---

  if (!isArray(world.edges)) {
    errors.push('world.edges: must be an array');
  } else {
    const edgeKeys = new Set<string>();
    for (let i = 0; i < world.edges.length; i++) {
      validateEdge(world.edges[i], i, provinceIds, errors);
      const e = world.edges[i] as Record<string, unknown>;
      if (isString(e.sourceId) && isString(e.targetId)) {
        const key = [e.sourceId, e.targetId].sort().join('_');
        if (edgeKeys.has(key)) {
          errors.push(`world.edges[${i}]: duplicate edge between "${e.sourceId}" and "${e.targetId}"`);
        }
        edgeKeys.add(key);
      }
    }
  }

  // --- Nations ---

  const nationIds = new Set<string>();

  if (isArray(json.nations)) {
    for (let i = 0; i < json.nations.length; i++) {
      validateNationDef(json.nations[i], i, errors);
      const n = json.nations[i] as Record<string, unknown>;
      if (isString(n.id)) {
        if (nationIds.has(n.id)) {
          errors.push(`nations[${i}].id: duplicate nation id "${n.id}"`);
        }
        nationIds.add(n.id);
      }
    }
  }

  // --- Starting State ---

  if (isObject(json.startingState)) {
    validateStartingState(json.startingState, provinceIds, nationIds, errors);
  }

  // --- Scripted Events ---

  if (isArray(json.scriptedEvents)) {
    for (let i = 0; i < json.scriptedEvents.length; i++) {
      validateGameEvent(json.scriptedEvents[i], i, 'scriptedEvents', errors);
    }
  }

  // --- Cross-reference: victory condition regions must be valid province IDs ---

  if (isObject(json.meta)) {
    const meta = json.meta as Record<string, unknown>;
    if (isObject(meta.victoryConditions)) {
      const vc = meta.victoryConditions as Record<string, unknown>;
      if (isObject(vc.primaryObjective)) {
        const obj = vc.primaryObjective as Record<string, unknown>;
        if (obj.type === 'control_regions' && isArray(obj.regions)) {
          for (const region of obj.regions) {
            if (isString(region) && !provinceIds.has(region)) {
              errors.push(`victoryConditions.primaryObjective.regions: "${region}" not found in world.provinces`);
            }
          }
        }
      }
    }
  }

  // --- Cross-reference: each nation should have a Capital province ---

  if (isObject(json.startingState) && isArray(world.provinces)) {
    const ss = json.startingState as Record<string, unknown>;
    if (isObject(ss.provinceOwnership)) {
      const ownership = ss.provinceOwnership as Record<string, string>;
      for (const nId of nationIds) {
        const ownedProvinces = Object.entries(ownership)
          .filter(([, owner]) => owner === nId)
          .map(([pId]) => pId);
        if (ownedProvinces.length === 0) {
          errors.push(`Cross-reference: nation "${nId}" has no provinces assigned in startingState.provinceOwnership`);
        }
        const hasCapital = (world.provinces as Record<string, unknown>[]).some(
          (p) => isString(p.id) && ownedProvinces.includes(p.id) && p.strategicTag === 'Capital'
        );
        if (!hasCapital && ownedProvinces.length > 0) {
          errors.push(`Cross-reference: nation "${nId}" has no Capital province`);
        }
      }
    }
  }

  // --- Throw or return ---

  if (errors.length > 0) {
    throw new ScenarioValidationError(errors);
  }

  return json as unknown as Scenario;
}
