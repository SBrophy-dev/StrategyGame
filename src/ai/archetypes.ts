import type { Archetype, UtilityWeights } from '../types';

// ---------------------------------------------------------------------------
// Archetype → UtilityWeights mapping (Convention #8: constants ONLY)
// ---------------------------------------------------------------------------
// Each weight is 0.0–1.0 representing relative priority for that action category.
// These are loaded into nation.utilityWeights at scenario init time.
// ---------------------------------------------------------------------------

export const ARCHETYPE_WEIGHTS: Record<Archetype, UtilityWeights> = {
  /** Weights military actions and territory gain heavily */
  Expansionist: {
    militaryAction: 0.9,
    territoryGain: 1.0,
    tradeDeal: 0.3,
    economicDev: 0.4,
    influenceGain: 0.2,
    defensivePosture: 0.3,
    allianceBuilding: 0.4,
    vassalage: 0.5,
    navalAction: 0.5,
  },

  /** Weights trade deals, economic development, and Influence accumulation */
  Trader: {
    militaryAction: 0.2,
    territoryGain: 0.3,
    tradeDeal: 1.0,
    economicDev: 0.9,
    influenceGain: 0.8,
    defensivePosture: 0.4,
    allianceBuilding: 0.6,
    vassalage: 0.2,
    navalAction: 0.5,
  },

  /** Weights internal development, non-aggression, and defensive posture */
  Isolationist: {
    militaryAction: 0.2,
    territoryGain: 0.1,
    tradeDeal: 0.4,
    economicDev: 1.0,
    influenceGain: 0.3,
    defensivePosture: 0.9,
    allianceBuilding: 0.3,
    vassalage: 0.1,
    navalAction: 0.2,
  },

  /** Weights alliance-building, vassalage, and indirect power projection */
  Hegemon: {
    militaryAction: 0.5,
    territoryGain: 0.6,
    tradeDeal: 0.5,
    economicDev: 0.5,
    influenceGain: 0.7,
    defensivePosture: 0.4,
    allianceBuilding: 1.0,
    vassalage: 0.9,
    navalAction: 0.4,
  },
};

// ---------------------------------------------------------------------------
// Base Influence caps by archetype (SPEC §5.1)
// ---------------------------------------------------------------------------

export const BASE_INFLUENCE_CAPS: Record<Archetype, number> = {
  Expansionist: 60,
  Trader: 120,
  Isolationist: 50,
  Hegemon: 90,
};
