import type { Province } from './province';
import type { Edge } from './edge';
import type { ResourceLedger } from './resources';
import type { Archetype, Modifier } from './nation';
import type { Agenda } from './diplomacy';
import type { GameEvent } from './events';

// --- Victory Conditions ---

export interface ControlRegionsObjective {
  type: 'control_regions';
  regions: string[];
  turnsHeld: number;
}

export interface DominationObjective {
  type: 'domination';
  threshold: number; // fraction of total provinces, e.g. 0.65
}

export type PrimaryObjective = ControlRegionsObjective | DominationObjective;

export type TiebreakerMethod = 'total_score';

export interface VictoryConditions {
  primaryObjective: PrimaryObjective;
  dominationThreshold: number;
  turnLimit: number;
  tiebreaker: TiebreakerMethod;
}

// --- Development Output Table Override ---

export interface FocusOutputRow {
  gold?: number;
  food?: number;
  production?: number;
  manpower?: number;
  influence?: number;
}

export type DevelopmentOutputTable = Record<string, Record<string, FocusOutputRow>>;
// devLevel (as string key "1"-"5") → focus → output deltas

// --- Scenario Meta ---

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  turnLimit: number;
  victoryConditions: VictoryConditions;
  exileWindowTurns: number;
  exileRestoreCost: number; // Influence cost
  siegeTurns: number;
  relationDecayPerTurn: number;
  majorBattleThreshold?: number; // combined strength threshold for major battle
  developmentOutputTable?: DevelopmentOutputTable; // optional override
}

// --- Nation Definition (in scenario JSON) ---

export interface NationDefinition {
  id: string;
  name: string;
  color: string;
  archetype: Archetype;
  modifiers: Modifier[];
  agenda: Agenda;
}

// --- Army Definition ---

export interface ArmyDefinition {
  id: string;
  type: 'Land' | 'Naval';
  strength: number;
  provinceId: string;
  ownerId: string;
}

// --- Starting State ---

export interface StartingState {
  provinceOwnership: Record<string, string>; // provinceId → nationId
  armies: ArmyDefinition[];
  resources: Record<string, ResourceLedger>; // nationId → starting resources
  relations: Record<string, number>; // "n01_n02" → relation score
}

// --- Full Scenario ---

export interface Scenario {
  meta: ScenarioMeta;
  world: {
    provinces: Province[];
    edges: Edge[];
  };
  nations: NationDefinition[];
  startingState: StartingState;
  scriptedEvents: GameEvent[];
  genericEvents: string[]; // IDs referencing generic event library
}
