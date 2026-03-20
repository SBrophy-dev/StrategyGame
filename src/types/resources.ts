export type ResourceType = 'gold' | 'food' | 'production' | 'influence' | 'manpower';

export interface ResourceLedger {
  gold: number;
  food: number;
  production: number;
  influence: number;
  manpower: number;
}
