import type { Province } from './province';
import type { Edge } from './edge';
import type { Nation } from './nation';
import type { Order } from './orders';
import type { Scenario } from './scenario';
import type { GameEvent } from './events';

// --- Fired event with nation context (populated during bookkeeping) ---

export interface FiredEvent {
  event: GameEvent;
  nationId: string;
}

// --- Army (runtime state, extends definition) ---

export interface Army {
  id: string;
  type: 'Land' | 'Naval';
  strength: number;
  provinceId: string;
  ownerId: string;
  siegeTurns: number; // consecutive turns occupying a fortified enemy province
}

// --- War tracking ---

export interface War {
  aggressorId: string;
  defenderId: string;
  startedOnTurn: number;
}

// --- Conflict Report Entry ---

export type ConflictType =
  | 'peace_over_war'
  | 'defender_swap'
  | 'blockade_over_trade'
  | 'agreement_priority'
  | 'simultaneous_entry'
  | 'simultaneous_war_declaration'
  | 'alliance_proposal_tiebreak'
  | 'battle';

export interface ConflictReportEntry {
  type: ConflictType;
  involvedNations: string[];
  provinceId?: string;
  edgeSourceId?: string;
  edgeTargetId?: string;
  description: string;
  resolution: string;
}

export interface ConflictReport {
  turn: number;
  entries: ConflictReportEntry[];
}

// --- Eliminated Nation Log ---

export interface EliminationRecord {
  nationId: string;
  eliminatedOnTurn: number;
  eliminatorId: string;
  activeAgreementsAtTime: string[]; // agreement descriptions
}

// --- Turn Log ---

export interface TurnLog {
  turn: number;
  orders: Record<string, Order[]>; // nationId → orders submitted
  conflictReport: ConflictReport;
  firedEvents: FiredEvent[];
  eliminations: EliminationRecord[];
}

// --- Full Game State ---

export interface GameState {
  scenario: Scenario;
  turn: number;
  provinces: Province[];
  edges: Edge[];
  nations: Nation[];
  armies: Army[];
  wars: War[];
  turnLogs: TurnLog[];
  eliminationLog: EliminationRecord[];
  winner: string | null; // nationId or null if game ongoing
  gameOver: boolean;
}

// --- Game Context (passed to AI modifiers and event evaluation) ---

export interface GameContext {
  state: GameState;
  currentNationId: string;
  turn: number;
}
