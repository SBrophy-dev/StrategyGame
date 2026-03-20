import type {
  Province,
  Edge,
  Nation,
  Army,
  ResourceLedger,
  DevLevel,
  ProvinceFocus,
  PopulationLevel,
  DevelopmentOutputTable,
  Scenario,
  GameState,
} from '../types';

// --- Building derivation (Convention #4: derived, never stored) ---

export interface Building {
  name: string;
  description: string;
}

const BUILDING_TABLE: Record<string, Record<string, Building[]>> = {
  '1': {
    _base: [{ name: 'Settlement', description: 'Basic settlement' }],
  },
  '2': {
    Agricultural: [{ name: 'Farmstead', description: 'Organized farming' }],
    Industrial: [{ name: 'Workshop', description: 'Basic production facility' }],
    Commercial: [{ name: 'Market', description: 'Local trade hub' }],
    Military: [{ name: 'Barracks', description: 'Military training grounds' }],
  },
  '3': {
    Agricultural: [
      { name: 'Farmstead', description: 'Organized farming' },
      { name: 'Granary', description: 'Food storage and surplus management' },
    ],
    Industrial: [
      { name: 'Workshop', description: 'Basic production facility' },
      { name: 'Forge', description: 'Advanced metalworking' },
    ],
    Commercial: [
      { name: 'Market', description: 'Local trade hub' },
      { name: 'Counting House', description: 'Financial management' },
    ],
    Military: [
      { name: 'Barracks', description: 'Military training grounds' },
      { name: 'Armory', description: 'Weapon and armor storage' },
    ],
  },
  '4': {
    Agricultural: [
      { name: 'Farmstead', description: 'Organized farming' },
      { name: 'Granary', description: 'Food storage and surplus management' },
      { name: 'Irrigation Works', description: 'Advanced water management' },
    ],
    Industrial: [
      { name: 'Workshop', description: 'Basic production facility' },
      { name: 'Forge', description: 'Advanced metalworking' },
      { name: 'Foundry', description: 'Large-scale manufacturing' },
    ],
    Commercial: [
      { name: 'Market', description: 'Local trade hub' },
      { name: 'Counting House', description: 'Financial management' },
      { name: 'Trade Guild', description: 'Organized merchant network' },
    ],
    Military: [
      { name: 'Barracks', description: 'Military training grounds' },
      { name: 'Armory', description: 'Weapon and armor storage' },
      { name: 'War Academy', description: 'Officer training facility' },
    ],
  },
  '5': {
    Agricultural: [
      { name: 'Farmstead', description: 'Organized farming' },
      { name: 'Granary', description: 'Food storage and surplus management' },
      { name: 'Irrigation Works', description: 'Advanced water management' },
      { name: 'Breadbasket', description: 'Provincial food surplus center' },
    ],
    Industrial: [
      { name: 'Workshop', description: 'Basic production facility' },
      { name: 'Forge', description: 'Advanced metalworking' },
      { name: 'Foundry', description: 'Large-scale manufacturing' },
      { name: 'Arsenal', description: 'State-level production complex' },
    ],
    Commercial: [
      { name: 'Market', description: 'Local trade hub' },
      { name: 'Counting House', description: 'Financial management' },
      { name: 'Trade Guild', description: 'Organized merchant network' },
      { name: 'Grand Exchange', description: 'Major economic hub' },
    ],
    Military: [
      { name: 'Barracks', description: 'Military training grounds' },
      { name: 'Armory', description: 'Weapon and armor storage' },
      { name: 'War Academy', description: 'Officer training facility' },
      { name: 'Citadel', description: 'Supreme military headquarters' },
    ],
  },
};

/**
 * Derive buildings from devLevel and focus. Pure function — never stored on province.
 */
export function getBuildings(devLevel: DevLevel, focus: ProvinceFocus | null): Building[] {
  if (devLevel === 1 || focus === null) {
    return [...(BUILDING_TABLE['1']._base ?? [])];
  }
  return [...(BUILDING_TABLE[String(devLevel)]?.[focus] ?? [])];
}

// --- Province output (Convention #4: derived, never stored) ---

// Default output multiplier table from SPEC §11
const DEFAULT_OUTPUT_TABLE: DevelopmentOutputTable = {
  '1': {
    Agricultural: { food: 2 },
    Industrial: { production: 2 },
    Commercial: { gold: 2 },
    Military: { manpower: 2 },
  },
  '2': {
    Agricultural: { food: 4 },
    Industrial: { production: 4 },
    Commercial: { gold: 4 },
    Military: { manpower: 4 },
  },
  '3': {
    Agricultural: { food: 6, gold: 1 },
    Industrial: { production: 6, gold: 1 },
    Commercial: { gold: 7 },
    Military: { manpower: 6, production: 1 },
  },
  '4': {
    Agricultural: { food: 9, gold: 2 },
    Industrial: { production: 9, gold: 2 },
    Commercial: { gold: 11 },
    Military: { manpower: 9, production: 3 },
  },
  '5': {
    Agricultural: { food: 13, gold: 3 },
    Industrial: { production: 13, gold: 3 },
    Commercial: { gold: 16 },
    Military: { manpower: 13, production: 5 },
  },
};

/**
 * Get the output multiplier table, using scenario override if provided.
 * Convention #5: always read from scenario, never hardcode fallback in engine.
 */
function getOutputTable(scenario: Scenario): DevelopmentOutputTable {
  return scenario.meta.developmentOutputTable ?? DEFAULT_OUTPUT_TABLE;
}

/**
 * Compute resource output for a single province. Pure function — never stored.
 * Rebel or unowned provinces produce nothing.
 */
export function getProvinceOutput(province: Province, scenario: Scenario): ResourceLedger {
  const empty: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };

  if (province.ownerId === null || province.ownerId === 'rebel') {
    return empty;
  }

  const table = getOutputTable(scenario);
  const devKey = String(province.devLevel);
  // At devLevel 1 with no focus, use a base output of the devLevel 1 row
  // Focus is null until devLevel >= 2, so devLevel 1 just gets a flat base
  const focusKey = province.focus ?? 'Agricultural'; // devLevel 1 default
  const row = table[devKey]?.[focusKey];

  if (!row) {
    return empty;
  }

  return {
    gold: row.gold ?? 0,
    food: row.food ?? 0,
    production: row.production ?? 0,
    influence: row.influence ?? 0,
    manpower: row.manpower ?? 0,
  };
}

// --- Population multipliers for Manpower soft cap ---

const POPULATION_MULTIPLIER: Record<PopulationLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Thriving: 4,
};

/**
 * Calculate the manpower soft cap for a nation based on its owned provinces.
 * soft cap = sum of (populationMultiplier × devLevel) across owned provinces.
 */
export function getManpowerSoftCap(
  nationId: string,
  provinces: Province[]
): number {
  return provinces
    .filter((p) => p.ownerId === nationId)
    .reduce((sum, p) => sum + POPULATION_MULTIPLIER[p.population] * p.devLevel, 0);
}

/**
 * Calculate the influence soft cap for a nation.
 * cap = archetype base cap + (active Trade Deals × 5)
 */
export function getInfluenceSoftCap(nation: Nation): number {
  // Base caps imported from archetypes at load time via nation.utilityWeights
  // We need archetype base caps here — defined per SPEC §5.1
  const BASE_INFLUENCE_CAPS: Record<string, number> = {
    Expansionist: 60,
    Trader: 120,
    Isolationist: 50,
    Hegemon: 90,
  };
  const baseCap = BASE_INFLUENCE_CAPS[nation.archetype] ?? 60;

  let activeTradeDeals = 0;
  for (const agreements of Object.values(nation.agreements)) {
    for (const a of agreements) {
      if (a.type === 'TradeDeal' && a.active) {
        activeTradeDeals++;
      }
    }
  }

  return baseCap + activeTradeDeals * 5;
}

/**
 * Compute total income for a nation from all owned provinces.
 */
export function getNationIncome(
  nationId: string,
  provinces: Province[],
  scenario: Scenario
): ResourceLedger {
  const income: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };

  for (const province of provinces) {
    if (province.ownerId === nationId) {
      const output = getProvinceOutput(province, scenario);
      income.gold += output.gold;
      income.food += output.food;
      income.production += output.production;
      income.influence += output.influence;
      income.manpower += output.manpower;
    }
  }

  return income;
}

/**
 * Compute food consumption for a nation's armies.
 * Each army unit consumes 1 food per strength point per turn.
 */
export function getArmyFoodConsumption(nationId: string, armies: Army[]): number {
  return armies
    .filter((a) => a.ownerId === nationId)
    .reduce((sum, a) => sum + a.strength, 0);
}

/**
 * Compute trade deal gold bonuses for a nation from active trade edges.
 */
export function getTradeDealBonus(
  nationId: string,
  edges: Edge[],
  provinces: Province[]
): number {
  let bonus = 0;

  for (const edge of edges) {
    if (!edge.tradeActive) continue;

    const sourceProvince = provinces.find((p) => p.id === edge.sourceId);
    const targetProvince = provinces.find((p) => p.id === edge.targetId);
    if (!sourceProvince || !targetProvince) continue;

    // Nation must own one of the two connected provinces
    if (sourceProvince.ownerId === nationId || targetProvince.ownerId === nationId) {
      bonus += edge.tradeValue;
    }
  }

  return bonus;
}

/**
 * Compute vassalage tribute paid to a liege.
 * Returns positive amounts (what the liege receives).
 */
export function getVassalTribute(
  liegeId: string,
  nations: Nation[]
): ResourceLedger {
  const tribute: ResourceLedger = { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 };

  for (const nation of nations) {
    if (nation.id === liegeId) continue;
    const agreements = nation.agreements[liegeId] ?? [];
    for (const a of agreements) {
      if (a.type === 'Vassalage' && a.active && a.partnerNationId === liegeId) {
        // Vassal pays 10% of gold and production as tribute
        tribute.gold += Math.floor(nation.resources.gold * 0.1);
        tribute.production += Math.floor(nation.resources.production * 0.1);
      }
    }
  }

  return tribute;
}

/**
 * Run the full resource bookkeeping pass for a single nation.
 * Returns the updated ResourceLedger (new state, not a mutation).
 */
export function runBookkeeping(
  nation: Nation,
  state: GameState
): ResourceLedger {
  const { provinces, edges, armies, scenario, nations } = state;
  const income = getNationIncome(nation.id, provinces, scenario);
  const foodConsumption = getArmyFoodConsumption(nation.id, armies);
  const tradeBonus = getTradeDealBonus(nation.id, edges, provinces);
  const tribute = getVassalTribute(nation.id, nations);
  const influenceCap = getInfluenceSoftCap(nation);
  const manpowerCap = getManpowerSoftCap(nation.id, provinces);

  let gold = nation.resources.gold + income.gold + tradeBonus + tribute.gold;
  let food = nation.resources.food + income.food - foodConsumption;
  let production = nation.resources.production + income.production + tribute.production;
  let influence = nation.resources.influence + income.influence;
  let manpower = nation.resources.manpower + income.manpower;

  // Influence decay: if over cap, decay 10% of excess per turn
  if (influence > influenceCap) {
    const excess = influence - influenceCap;
    influence -= Math.ceil(excess * 0.1);
  }

  // Manpower soft cap: don't accumulate above cap
  if (manpower > manpowerCap) {
    manpower = manpowerCap;
  }

  return { gold, food, production, influence, manpower };
}
