export type TerrainType = 'Plains' | 'Forest' | 'Mountain' | 'Coastal' | 'Desert';

export type ProvinceFocus = 'Agricultural' | 'Industrial' | 'Commercial' | 'Military';

export type StrategicTag = 'Capital' | 'KeyRegion' | 'Port';

export type PopulationLevel = 'Low' | 'Medium' | 'High' | 'Thriving';

export type DevLevel = 1 | 2 | 3 | 4 | 5;

export interface ProvinceLayout {
  x: number;
  y: number;
  polygon: [number, number][];
}

export interface Province {
  id: string;
  name: string;
  ownerId: string | 'rebel' | null;
  terrain: TerrainType;
  devLevel: DevLevel;
  focus: ProvinceFocus | null; // null until devLevel >= 2
  unrest: number; // 0–100; rebellion triggers at 100
  fortLevel: number; // 0–3
  population: PopulationLevel;
  strategicTag: StrategicTag | null;
  layout: ProvinceLayout; // PRESENTATION ONLY — never read by engine or AI code
}
