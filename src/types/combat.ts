export interface CombatParams {
  attackerStrength: number;
  defenderStrength: number;
  fortBonus: number;
  terrainModifier: number;
  seed: number;
}

export interface CombatResult {
  winner: 'attacker' | 'defender';
  attackerCasualties: number;
  defenderCasualties: number;
  rounds: number; // 1 for normal battles, >1 for major battles
}
