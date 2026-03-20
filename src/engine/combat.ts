import type { CombatParams, CombatResult } from '../types';

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces deterministic floats in [0, 1).
 */
function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resolve a single combat encounter. Pure function — same seed produces same result.
 *
 * Normal battle: single roll determines winner.
 * Major battle (isMajor=true): multi-round attrition until one side is eliminated.
 */
export function resolveCombat(
  params: CombatParams,
  isMajor: boolean = false
): CombatResult {
  const { attackerStrength, defenderStrength, fortBonus, terrainModifier, seed } = params;
  const rng = createSeededRng(seed);

  if (attackerStrength <= 0 && defenderStrength <= 0) {
    return { winner: 'defender', attackerCasualties: 0, defenderCasualties: 0, rounds: 1 };
  }
  if (attackerStrength <= 0) {
    return { winner: 'defender', attackerCasualties: 0, defenderCasualties: 0, rounds: 1 };
  }
  if (defenderStrength <= 0) {
    return { winner: 'attacker', attackerCasualties: 0, defenderCasualties: 0, rounds: 1 };
  }

  // Effective defender strength includes fort bonus and terrain modifier
  const effectiveDefender = defenderStrength + fortBonus + terrainModifier;

  if (!isMajor) {
    return resolveNormalBattle(attackerStrength, effectiveDefender, defenderStrength, rng);
  }

  return resolveMajorBattle(attackerStrength, effectiveDefender, defenderStrength, rng);
}

/**
 * Normal battle: single roll. Winner determined by power ratio + randomness.
 * Casualties proportional to the ratio of opposing strength.
 */
function resolveNormalBattle(
  attackerStr: number,
  effectiveDefender: number,
  rawDefenderStr: number,
  rng: () => number
): CombatResult {
  const total = attackerStr + effectiveDefender;
  const attackerChance = attackerStr / total;
  const roll = rng();

  const winner: 'attacker' | 'defender' = roll < attackerChance ? 'attacker' : 'defender';

  // Casualties: loser takes heavier losses
  const loserCasualtyRate = 0.3 + rng() * 0.2; // 30-50%
  const winnerCasualtyRate = 0.1 + rng() * 0.1; // 10-20%

  let attackerCasualties: number;
  let defenderCasualties: number;

  if (winner === 'attacker') {
    attackerCasualties = Math.round(attackerStr * winnerCasualtyRate);
    defenderCasualties = Math.round(rawDefenderStr * loserCasualtyRate);
  } else {
    attackerCasualties = Math.round(attackerStr * loserCasualtyRate);
    defenderCasualties = Math.round(rawDefenderStr * winnerCasualtyRate);
  }

  return { winner, attackerCasualties, defenderCasualties, rounds: 1 };
}

/**
 * Major battle: multi-round attrition. Each round both sides take proportional damage.
 * Continues until one side is eliminated (strength <= 0).
 */
function resolveMajorBattle(
  attackerStr: number,
  effectiveDefender: number,
  rawDefenderStr: number,
  rng: () => number
): CombatResult {
  let currentAttacker = attackerStr;
  let currentDefender = rawDefenderStr;
  let currentEffectiveDefender = effectiveDefender;
  let rounds = 0;
  const maxRounds = 20; // safety cap

  while (currentAttacker > 0 && currentDefender > 0 && rounds < maxRounds) {
    rounds++;
    const total = currentAttacker + currentEffectiveDefender;
    const defenderPowerRatio = currentEffectiveDefender / total;
    const attackerPowerRatio = currentAttacker / total;

    // Each side inflicts damage proportional to its power ratio, with randomness
    const attackerDamage = currentAttacker * defenderPowerRatio * (0.15 + rng() * 0.1);
    const defenderDamage = currentDefender * attackerPowerRatio * (0.15 + rng() * 0.1);

    currentAttacker = Math.max(0, currentAttacker - Math.round(attackerDamage));
    currentDefender = Math.max(0, currentDefender - Math.round(defenderDamage));

    // Recalculate effective defender (fort/terrain bonus stays, but proportional to remaining)
    if (rawDefenderStr > 0) {
      const defenderRatio = currentDefender / rawDefenderStr;
      const bonuses = effectiveDefender - rawDefenderStr;
      currentEffectiveDefender = currentDefender + bonuses * defenderRatio;
    }
  }

  const winner: 'attacker' | 'defender' = currentAttacker > currentDefender ? 'attacker' : 'defender';
  const attackerCasualties = attackerStr - currentAttacker;
  const defenderCasualties = rawDefenderStr - currentDefender;

  return { winner, attackerCasualties, defenderCasualties, rounds };
}

/**
 * Compute the terrain modifier for combat in a given terrain type.
 * Defenders benefit from difficult terrain.
 */
export function getTerrainModifier(terrain: string): number {
  switch (terrain) {
    case 'Mountain': return 5;
    case 'Forest': return 3;
    case 'Desert': return 1;
    case 'Coastal': return 0;
    case 'Plains': return 0;
    default: return 0;
  }
}

/**
 * Compute fort bonus for defender based on fort level.
 * Each fort level adds a flat defensive bonus.
 */
export function getFortBonus(fortLevel: number): number {
  return fortLevel * 5;
}
