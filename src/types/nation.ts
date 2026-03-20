import type { ResourceLedger } from './resources';
import type { Agreement, Agenda } from './diplomacy';

export type Archetype = 'Expansionist' | 'Trader' | 'Isolationist' | 'Hegemon';

export type Modifier =
  | 'Opportunist'
  | 'Paranoid'
  | 'Honorable'
  | 'NavalFocus'
  | 'Grudgeholder'
  | 'Militarist';

export interface UtilityWeights {
  militaryAction: number;
  territoryGain: number;
  tradeDeal: number;
  economicDev: number;
  influenceGain: number;
  defensivePosture: number;
  allianceBuilding: number;
  vassalage: number;
  navalAction: number;
}

export type VisibilityLevel = 'Hidden' | 'Approximate' | 'Revealed';

export interface IntelTrack {
  military: VisibilityLevel;
  economic: VisibilityLevel;
  diplomatic: VisibilityLevel;
  political: VisibilityLevel;
}

export type IntelRecord = IntelTrack;

export interface Nation {
  id: string;
  name: string;
  color: string;
  archetype: Archetype;
  modifiers: Modifier[]; // up to 2
  agenda: Agenda;
  utilityWeights: UtilityWeights;
  resources: ResourceLedger;
  relations: Record<string, number>; // nationId → -100 to +100
  agreements: Record<string, Agreement[]>; // nationId → active agreements
  intelOf: Record<string, IntelRecord>; // nationId → intel object
  eliminatedOnTurn?: number;
  exileWindowExpires?: number;
}
