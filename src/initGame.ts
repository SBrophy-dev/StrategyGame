/**
 * initGame.ts — Initializes a GameState from a validated Scenario.
 * Pure function: no side effects, no storage access.
 */

import type {
  Scenario,
  GameState,
  Nation,
  Army,
  IntelRecord,
  VisibilityLevel,
} from './types';
import { ARCHETYPE_WEIGHTS } from './ai/archetypes';

// ---------------------------------------------------------------------------
// Default intel: all tracks Hidden
// ---------------------------------------------------------------------------

function defaultIntelRecord(): IntelRecord {
  return {
    military: 'Hidden' as VisibilityLevel,
    economic: 'Hidden' as VisibilityLevel,
    diplomatic: 'Hidden' as VisibilityLevel,
    political: 'Hidden' as VisibilityLevel,
  };
}

// ---------------------------------------------------------------------------
// Parse the "n01_n02" keyed relation map into per-nation Records
// ---------------------------------------------------------------------------

function buildRelations(
  nationIds: string[],
  relationsMap: Record<string, number>
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const id of nationIds) {
    result[id] = {};
  }

  for (const [key, value] of Object.entries(relationsMap)) {
    const [a, b] = key.split('_');
    if (a && b) {
      if (result[a]) result[a][b] = value;
      if (result[b]) result[b][a] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build intel records: adjacent owners get Approximate military by default
// ---------------------------------------------------------------------------

function buildIntelOf(
  nationId: string,
  allNationIds: string[],
  provinceOwnership: Record<string, string>,
  edges: { sourceId: string; targetId: string }[]
): Record<string, IntelRecord> {
  const intel: Record<string, IntelRecord> = {};

  // Build adjacency set for this nation's provinces
  const ownedProvinces = new Set<string>();
  for (const [pId, nId] of Object.entries(provinceOwnership)) {
    if (nId === nationId) ownedProvinces.add(pId);
  }

  const adjacentNations = new Set<string>();
  for (const edge of edges) {
    if (ownedProvinces.has(edge.sourceId)) {
      const neighbor = provinceOwnership[edge.targetId];
      if (neighbor && neighbor !== nationId) adjacentNations.add(neighbor);
    }
    if (ownedProvinces.has(edge.targetId)) {
      const neighbor = provinceOwnership[edge.sourceId];
      if (neighbor && neighbor !== nationId) adjacentNations.add(neighbor);
    }
  }

  for (const otherId of allNationIds) {
    if (otherId === nationId) continue;
    const record = defaultIntelRecord();
    // Adjacent nations: Approximate military intel by default
    if (adjacentNations.has(otherId)) {
      record.military = 'Approximate';
    }
    intel[otherId] = record;
  }

  return intel;
}

// ---------------------------------------------------------------------------
// Main initialization
// ---------------------------------------------------------------------------

export function initializeGameState(scenario: Scenario): GameState {
  const nationIds = scenario.nations.map((n) => n.id);
  const relationsMap = buildRelations(nationIds, scenario.startingState.relations);

  // Build Nation objects from NationDefinition + starting state
  const nations: Nation[] = scenario.nations.map((def) => ({
    id: def.id,
    name: def.name,
    color: def.color,
    archetype: def.archetype,
    modifiers: def.modifiers,
    agenda: def.agenda,
    utilityWeights: ARCHETYPE_WEIGHTS[def.archetype],
    resources: scenario.startingState.resources[def.id] ?? {
      gold: 0,
      food: 0,
      production: 0,
      influence: 0,
      manpower: 0,
    },
    relations: relationsMap[def.id] ?? {},
    agreements: {},
    intelOf: buildIntelOf(
      def.id,
      nationIds,
      scenario.startingState.provinceOwnership,
      scenario.world.edges
    ),
  }));

  // Apply province ownership from starting state
  const provinces = scenario.world.provinces.map((p) => ({
    ...p,
    ownerId: scenario.startingState.provinceOwnership[p.id] ?? p.ownerId,
  }));

  // Build armies with siegeTurns initialized to 0
  const armies: Army[] = scenario.startingState.armies.map((a) => ({
    id: a.id,
    type: a.type,
    strength: a.strength,
    provinceId: a.provinceId,
    ownerId: a.ownerId,
    siegeTurns: 0,
  }));

  return {
    scenario,
    turn: 1,
    provinces,
    edges: [...scenario.world.edges],
    nations,
    armies,
    wars: [],
    turnLogs: [],
    eliminationLog: [],
    winner: null,
    gameOver: false,
  };
}
