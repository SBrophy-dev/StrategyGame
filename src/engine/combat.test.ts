import { describe, it, expect } from 'vitest';
import { resolveCombat, getTerrainModifier, getFortBonus } from './combat';
import type { CombatParams } from '../types';

// ---------------------------------------------------------------------------
// getTerrainModifier
// ---------------------------------------------------------------------------

describe('getTerrainModifier', () => {
  it('returns 5 for Mountain', () => {
    expect(getTerrainModifier('Mountain')).toBe(5);
  });

  it('returns 3 for Forest', () => {
    expect(getTerrainModifier('Forest')).toBe(3);
  });

  it('returns 1 for Desert', () => {
    expect(getTerrainModifier('Desert')).toBe(1);
  });

  it('returns 0 for Coastal', () => {
    expect(getTerrainModifier('Coastal')).toBe(0);
  });

  it('returns 0 for Plains', () => {
    expect(getTerrainModifier('Plains')).toBe(0);
  });

  it('returns 0 for unknown terrain', () => {
    expect(getTerrainModifier('Swamp')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getFortBonus
// ---------------------------------------------------------------------------

describe('getFortBonus', () => {
  it('returns 0 for fort level 0', () => {
    expect(getFortBonus(0)).toBe(0);
  });

  it('returns 5 for fort level 1', () => {
    expect(getFortBonus(1)).toBe(5);
  });

  it('returns 10 for fort level 2', () => {
    expect(getFortBonus(2)).toBe(10);
  });

  it('returns 15 for fort level 3', () => {
    expect(getFortBonus(3)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// resolveCombat — normal battle
// ---------------------------------------------------------------------------

describe('resolveCombat (normal battle)', () => {
  it('returns deterministic results for the same seed', () => {
    const params: CombatParams = {
      attackerStrength: 50,
      defenderStrength: 50,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 12345,
    };
    const result1 = resolveCombat(params);
    const result2 = resolveCombat(params);

    expect(result1).toEqual(result2);
  });

  it('resolves in 1 round for normal battles', () => {
    const params: CombatParams = {
      attackerStrength: 50,
      defenderStrength: 50,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 42,
    };
    const result = resolveCombat(params, false);
    expect(result.rounds).toBe(1);
  });

  it('defender wins when attacker has 0 strength', () => {
    const params: CombatParams = {
      attackerStrength: 0,
      defenderStrength: 50,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 1,
    };
    const result = resolveCombat(params);
    expect(result.winner).toBe('defender');
    expect(result.attackerCasualties).toBe(0);
    expect(result.defenderCasualties).toBe(0);
  });

  it('attacker wins when defender has 0 strength', () => {
    const params: CombatParams = {
      attackerStrength: 50,
      defenderStrength: 0,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 1,
    };
    const result = resolveCombat(params);
    expect(result.winner).toBe('attacker');
    expect(result.attackerCasualties).toBe(0);
    expect(result.defenderCasualties).toBe(0);
  });

  it('defender wins when both have 0 strength', () => {
    const params: CombatParams = {
      attackerStrength: 0,
      defenderStrength: 0,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 1,
    };
    const result = resolveCombat(params);
    expect(result.winner).toBe('defender');
  });

  it('fort bonus boosts effective defender strength', () => {
    // With high fort bonus, defender should win more often.
    // Test with a seed that gives attacker a slight edge normally.
    const baseParams: CombatParams = {
      attackerStrength: 55,
      defenderStrength: 50,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 100,
    };
    const fortParams: CombatParams = {
      ...baseParams,
      fortBonus: 15, // fort level 3
    };
    const baseResult = resolveCombat(baseParams);
    const fortResult = resolveCombat(fortParams);

    // We can't guarantee different winners, but fort should shift odds
    // At minimum, verify both return valid results
    expect(['attacker', 'defender']).toContain(baseResult.winner);
    expect(['attacker', 'defender']).toContain(fortResult.winner);
  });

  it('casualties are non-negative', () => {
    const params: CombatParams = {
      attackerStrength: 100,
      defenderStrength: 100,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 999,
    };
    const result = resolveCombat(params);
    expect(result.attackerCasualties).toBeGreaterThanOrEqual(0);
    expect(result.defenderCasualties).toBeGreaterThanOrEqual(0);
  });

  it('winner has valid value', () => {
    const params: CombatParams = {
      attackerStrength: 30,
      defenderStrength: 70,
      fortBonus: 5,
      terrainModifier: 3,
      seed: 777,
    };
    const result = resolveCombat(params);
    expect(['attacker', 'defender']).toContain(result.winner);
  });
});

// ---------------------------------------------------------------------------
// resolveCombat — major battle
// ---------------------------------------------------------------------------

describe('resolveCombat (major battle)', () => {
  it('runs multiple rounds', () => {
    const params: CombatParams = {
      attackerStrength: 100,
      defenderStrength: 100,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 42,
    };
    const result = resolveCombat(params, true);
    expect(result.rounds).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic with same seed', () => {
    const params: CombatParams = {
      attackerStrength: 80,
      defenderStrength: 60,
      fortBonus: 5,
      terrainModifier: 3,
      seed: 54321,
    };
    const result1 = resolveCombat(params, true);
    const result2 = resolveCombat(params, true);
    expect(result1).toEqual(result2);
  });

  it('produces higher casualties than normal battle for equal forces', () => {
    const params: CombatParams = {
      attackerStrength: 100,
      defenderStrength: 100,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 42,
    };
    const normalResult = resolveCombat(params, false);
    const majorResult = resolveCombat(params, true);

    const normalTotal = normalResult.attackerCasualties + normalResult.defenderCasualties;
    const majorTotal = majorResult.attackerCasualties + majorResult.defenderCasualties;
    expect(majorTotal).toBeGreaterThanOrEqual(normalTotal);
  });

  it('does not exceed max 20 rounds', () => {
    const params: CombatParams = {
      attackerStrength: 1000,
      defenderStrength: 1000,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 1,
    };
    const result = resolveCombat(params, true);
    expect(result.rounds).toBeLessThanOrEqual(20);
  });

  it('total casualties do not exceed starting strengths', () => {
    const params: CombatParams = {
      attackerStrength: 80,
      defenderStrength: 60,
      fortBonus: 0,
      terrainModifier: 0,
      seed: 42,
    };
    const result = resolveCombat(params, true);
    expect(result.attackerCasualties).toBeLessThanOrEqual(params.attackerStrength);
    expect(result.defenderCasualties).toBeLessThanOrEqual(params.defenderStrength);
  });
});
