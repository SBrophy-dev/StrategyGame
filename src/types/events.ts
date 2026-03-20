export interface EventCondition {
  expression: string; // e.g. "nation.wars.length > 0", "province.unrest >= 100"
}

export interface EventTrigger {
  type: 'condition' | 'turn' | 'scripted';
  conditions?: string[];
  onTurn?: number; // for turn-triggered scripted events
}

export interface ResourceDeltaEffect {
  type: 'resource_delta';
  resource: 'gold' | 'food' | 'production' | 'influence' | 'manpower';
  amount: number;
}

export interface RelationDeltaEffect {
  type: 'relation_delta';
  targets: string | 'all_at_war' | 'all_neighbors' | 'all';
  amount: number;
}

export interface UnrestDeltaEffect {
  type: 'unrest_delta';
  targets: string | 'all_owned' | 'affected_provinces';
  amount: number;
}

export interface OwnerChangeEffect {
  type: 'owner_change';
  newOwner: string | 'rebel';
}

export interface PopulationChangeEffect {
  type: 'population_change';
  targets: 'affected_provinces';
  change: -1; // population tier reduction
}

export interface DevCostModifierEffect {
  type: 'dev_cost_modifier';
  multiplier: number; // e.g. 0.8 for 20% reduction
  durationTurns: number;
}

export interface OutputModifierEffect {
  type: 'output_modifier';
  multiplier: number; // e.g. 0.7 for 30% reduction
  durationTurns: number;
}

export type EventEffect =
  | ResourceDeltaEffect
  | RelationDeltaEffect
  | UnrestDeltaEffect
  | OwnerChangeEffect
  | PopulationChangeEffect
  | DevCostModifierEffect
  | OutputModifierEffect;

export interface GameEvent {
  id: string;
  trigger: EventTrigger;
  effects: EventEffect[];
  narrative: string; // template string with {nation.name} etc.
}

export type ScriptedEvent = GameEvent; // scripted events use same shape, defined per-scenario
