import type {
  GameState,
  GameContext,
  Nation,
  Army,
  Order,
  ActionBudget,
  Modifier,
  AgreementType,
  ProvinceFocus,
} from '../types';

import {
  areAtWar,
  hasActiveAgreement,
  canDeclareWar,
  canProposeAlliance,
} from '../engine/diplomacy';

import { MODIFIER_FNS } from './modifiers';

// ---------------------------------------------------------------------------
// Convention #10: AI orders use the same Order types as player orders.
// All orders generated here pass through the same resolveOrders() function.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Action candidate — internal scoring struct
// ---------------------------------------------------------------------------

interface ActionCandidate {
  order: Order;
  category: 'diplomatic' | 'military' | 'construction' | 'wildcard';
  score: number;
}

// ---------------------------------------------------------------------------
// Helper: get adjacent province IDs for a given province
// ---------------------------------------------------------------------------

function getAdjacentProvinceIds(provinceId: string, state: GameState): string[] {
  const ids: string[] = [];
  for (const edge of state.edges) {
    if (edge.sourceId === provinceId) ids.push(edge.targetId);
    if (edge.targetId === provinceId) ids.push(edge.sourceId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Helper: get IDs of nations adjacent to the current nation
// ---------------------------------------------------------------------------

function getNeighborNationIds(nationId: string, state: GameState): string[] {
  const ownedIds = new Set(
    state.provinces.filter((p) => p.ownerId === nationId).map((p) => p.id)
  );
  const neighborIds = new Set<string>();
  for (const edge of state.edges) {
    if (ownedIds.has(edge.sourceId)) {
      const target = state.provinces.find((p) => p.id === edge.targetId);
      if (target?.ownerId && target.ownerId !== nationId && target.ownerId !== 'rebel') {
        neighborIds.add(target.ownerId);
      }
    }
    if (ownedIds.has(edge.targetId)) {
      const source = state.provinces.find((p) => p.id === edge.sourceId);
      if (source?.ownerId && source.ownerId !== nationId && source.ownerId !== 'rebel') {
        neighborIds.add(source.ownerId);
      }
    }
  }
  return [...neighborIds];
}

// ---------------------------------------------------------------------------
// Helper: total military strength for a nation
// ---------------------------------------------------------------------------

function getNationStrength(nationId: string, armies: Army[]): number {
  return armies
    .filter((a) => a.ownerId === nationId)
    .reduce((sum, a) => sum + a.strength, 0);
}

// ---------------------------------------------------------------------------
// Helper: check if an action aligns with the nation's agenda
// ---------------------------------------------------------------------------

function getAgendaMultiplier(
  order: Order,
  nation: Nation,
  state: GameState
): number {
  const agenda = nation.agenda;
  const priorityBonus = agenda.priority === 'high' ? 1.5 : agenda.priority === 'medium' ? 1.25 : 1.1;

  switch (agenda.type) {
    case 'control_region_cluster': {
      if (!agenda.targetRegions) return 1.0;
      // Boost military moves toward target regions and construction in target regions
      if (order.type === 'move_army') {
        if (agenda.targetRegions.includes(order.toProvinceId)) return priorityBonus;
      }
      if (order.type === 'upgrade_dev' || order.type === 'set_focus' || order.type === 'build_fort') {
        if (agenda.targetRegions.includes(order.provinceId)) return priorityBonus;
      }
      if (order.type === 'declare_war') {
        // Check if the target nation owns any target regions
        const targetOwnsRegion = agenda.targetRegions.some((r) => {
          const prov = state.provinces.find((p) => p.id === r);
          return prov?.ownerId === order.targetNationId;
        });
        if (targetOwnsRegion) return priorityBonus;
      }
      return 1.0;
    }
    case 'economic_dominance': {
      if (order.type === 'upgrade_dev' || order.type === 'set_focus') return priorityBonus;
      if (order.type === 'propose_agreement' && order.agreementType === 'TradeDeal') return priorityBonus;
      return 1.0;
    }
    case 'military_supremacy': {
      if (order.type === 'move_army' || order.type === 'declare_war' || order.type === 'blockade') {
        return priorityBonus;
      }
      if (order.type === 'build_fort') return priorityBonus;
      return 1.0;
    }
    case 'diplomatic_hegemony': {
      if (
        order.type === 'propose_agreement' ||
        order.type === 'offer_peace' ||
        order.type === 'spy'
      ) {
        return priorityBonus;
      }
      return 1.0;
    }
  }

  return 1.0;
}

// ---------------------------------------------------------------------------
// Apply nation's modifiers to a score based on action category
// ---------------------------------------------------------------------------

function applyModifiers(
  score: number,
  context: GameContext,
  nation: Nation,
  category: 'diplomatic' | 'military' | 'construction' | 'wildcard',
  isBetrayal: boolean,
  isNaval: boolean
): number {
  let adjusted = score;

  for (const mod of nation.modifiers) {
    const fn = MODIFIER_FNS[mod];
    if (!fn) continue;

    switch (mod as Modifier) {
      case 'Opportunist':
        // Applies to aggressive actions (military + war declarations)
        if (category === 'military' || isBetrayal) {
          adjusted = fn(adjusted, context);
        }
        break;
      case 'Paranoid':
        // Applies to defensive actions (defensive posture, NAPs)
        if (category === 'construction' || category === 'diplomatic') {
          adjusted = fn(adjusted, context);
        }
        break;
      case 'Honorable':
        // Applies only to betrayal actions (breaking agreements, declaring war on partners)
        if (isBetrayal) {
          adjusted = fn(adjusted, context);
        }
        break;
      case 'NavalFocus':
        // Applies only to naval-related actions
        if (isNaval) {
          adjusted = fn(adjusted, context);
        }
        break;
      case 'Grudgeholder':
        // Applies to peace offers toward aggressors
        if (category === 'diplomatic') {
          adjusted = fn(adjusted, context);
        }
        break;
      case 'Militarist':
        // Applies to all military actions
        if (category === 'military') {
          adjusted = fn(adjusted, context);
        }
        break;
    }
  }

  return adjusted;
}

// ---------------------------------------------------------------------------
// Compute action budget (SPEC §6.3)
// ---------------------------------------------------------------------------

function computeActionBudget(nationId: string, state: GameState): ActionBudget {
  const armyCount = state.armies.filter((a) => a.ownerId === nationId).length;
  const provinceCount = state.provinces.filter((p) => p.ownerId === nationId).length;

  return {
    diplomatic: 2,
    diplomaticUsed: 0,
    military: armyCount,
    militaryUsed: 0,
    construction: provinceCount,
    constructionUsed: 0,
    wildcard: 1,
    wildcardUsed: 0,
  };
}

// ---------------------------------------------------------------------------
// Generate diplomatic action candidates
// ---------------------------------------------------------------------------

function generateDiplomaticCandidates(
  nation: Nation,
  context: GameContext
): ActionCandidate[] {
  const { state } = context;
  const weights = nation.utilityWeights;
  const candidates: ActionCandidate[] = [];
  const neighborIds = getNeighborNationIds(nation.id, state);
  const livingNations = state.nations.filter(
    (n) => n.id !== nation.id && n.eliminatedOnTurn === undefined
  );

  // --- Offer peace if at war and exhausted ---
  for (const war of state.wars) {
    const isInvolved =
      war.aggressorId === nation.id || war.defenderId === nation.id;
    if (!isInvolved) continue;

    const enemyId =
      war.aggressorId === nation.id ? war.defenderId : war.aggressorId;
    const ownStrength = getNationStrength(nation.id, state.armies);
    const enemyStrength = getNationStrength(enemyId, state.armies);
    const warTurns = state.turn - war.startedOnTurn;

    // Seek peace if outmatched, exhausted, or war has dragged on
    const exhausted = nation.resources.manpower < 10;
    const losing = enemyStrength > ownStrength * 1.3;
    const stale = warTurns >= 8;

    if (exhausted || losing || stale) {
      const urgency = (exhausted ? 0.4 : 0) + (losing ? 0.3 : 0) + (stale ? 0.2 : 0);
      candidates.push({
        order: { type: 'offer_peace', nationId: nation.id, targetNationId: enemyId },
        category: 'diplomatic',
        score: (1 - weights.militaryAction) * 0.5 + urgency,
      });
    }
  }

  // --- Declare war on hostile/weak neighbors ---
  for (const targetId of neighborIds) {
    if (areAtWar(nation.id, targetId, state.wars)) continue;
    if (!canDeclareWar(nation, targetId, state.wars)) continue;

    const relation = nation.relations[targetId] ?? 0;
    const ownStrength = getNationStrength(nation.id, state.armies);
    const targetStrength = getNationStrength(targetId, state.armies);

    // Only declare war if we have a strength advantage
    if (ownStrength <= targetStrength * 0.8) continue;

    const hostility = Math.abs(Math.min(0, relation)) / 100; // 0–1
    const strengthRatio = targetStrength > 0 ? ownStrength / targetStrength : 2;
    const advantage = Math.min(1, (strengthRatio - 1) * 0.5);

    candidates.push({
      order: { type: 'declare_war', nationId: nation.id, targetNationId: targetId },
      category: 'diplomatic',
      score: weights.militaryAction * hostility * 0.5 + weights.territoryGain * advantage * 0.5,
    });
  }

  // --- Propose Trade Deals ---
  for (const other of livingNations) {
    if (hasActiveAgreement(nation, other.id, 'TradeDeal')) continue;
    if (areAtWar(nation.id, other.id, state.wars)) continue;

    const relation = nation.relations[other.id] ?? 0;
    if (relation < -10) continue; // Don't trade with hostile nations

    // Prefer trading with neighbors (shared edges provide trade bonus)
    const isNeighbor = neighborIds.includes(other.id);
    const neighborBonus = isNeighbor ? 0.3 : 0;
    const relationFactor = (relation + 100) / 200; // 0–1

    candidates.push({
      order: {
        type: 'propose_agreement',
        nationId: nation.id,
        targetNationId: other.id,
        agreementType: 'TradeDeal' as AgreementType,
        duration: 10,
      },
      category: 'diplomatic',
      score: weights.tradeDeal * (relationFactor * 0.5 + neighborBonus + 0.2),
    });
  }

  // --- Propose Non-Aggression Pacts ---
  for (const targetId of neighborIds) {
    if (hasActiveAgreement(nation, targetId, 'NonAggressionPact')) continue;
    if (areAtWar(nation.id, targetId, state.wars)) continue;

    const relation = nation.relations[targetId] ?? 0;
    if (relation < -20) continue;

    const targetStrength = getNationStrength(targetId, state.armies);
    const ownStrength = getNationStrength(nation.id, state.armies);
    const threatFactor = targetStrength > ownStrength ? 0.4 : 0.1;
    const relationFactor = (relation + 100) / 200;

    candidates.push({
      order: {
        type: 'propose_agreement',
        nationId: nation.id,
        targetNationId: targetId,
        agreementType: 'NonAggressionPact' as AgreementType,
        duration: 10,
      },
      category: 'diplomatic',
      score: weights.defensivePosture * (threatFactor + relationFactor * 0.3),
    });
  }

  // --- Propose Military Alliances ---
  for (const other of livingNations) {
    if (hasActiveAgreement(nation, other.id, 'MilitaryAlliance')) continue;
    if (!canProposeAlliance(nation, other.id)) continue;

    const relation = nation.relations[other.id] ?? 0;
    const relationFactor = (relation - 50) / 50; // 0–1 (since relation > 50 required)

    candidates.push({
      order: {
        type: 'propose_agreement',
        nationId: nation.id,
        targetNationId: other.id,
        agreementType: 'MilitaryAlliance' as AgreementType,
      },
      category: 'diplomatic',
      score: weights.allianceBuilding * (relationFactor * 0.6 + 0.3),
    });
  }

  // --- Propose Vassalage (Hegemon-oriented) ---
  for (const targetId of neighborIds) {
    if (hasActiveAgreement(nation, targetId, 'Vassalage')) continue;
    if (areAtWar(nation.id, targetId, state.wars)) continue;

    const targetStrength = getNationStrength(targetId, state.armies);
    const ownStrength = getNationStrength(nation.id, state.armies);

    // Only propose vassalage when significantly stronger
    if (ownStrength < targetStrength * 2) continue;

    const relation = nation.relations[targetId] ?? 0;
    if (relation < 0) continue;

    candidates.push({
      order: {
        type: 'propose_agreement',
        nationId: nation.id,
        targetNationId: targetId,
        agreementType: 'Vassalage' as AgreementType,
      },
      category: 'diplomatic',
      score: weights.vassalage * 0.6,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Generate military action candidates
// ---------------------------------------------------------------------------

function generateMilitaryCandidates(
  nation: Nation,
  context: GameContext
): ActionCandidate[] {
  const { state } = context;
  const weights = nation.utilityWeights;
  const candidates: ActionCandidate[] = [];
  const armies = state.armies.filter((a) => a.ownerId === nation.id);

  for (const army of armies) {
    const adjacentIds = getAdjacentProvinceIds(army.provinceId, state);
    const currentProvince = state.provinces.find((p) => p.id === army.provinceId);

    for (const targetId of adjacentIds) {
      const targetProvince = state.provinces.find((p) => p.id === targetId);
      if (!targetProvince) continue;

      // Check movement cost via edge
      const edge = state.edges.find(
        (e) =>
          (e.sourceId === army.provinceId && e.targetId === targetId) ||
          (e.targetId === army.provinceId && e.sourceId === targetId)
      );
      if (!edge) continue;

      // --- Attack enemy provinces ---
      if (
        targetProvince.ownerId &&
        targetProvince.ownerId !== nation.id &&
        targetProvince.ownerId !== 'rebel' &&
        areAtWar(nation.id, targetProvince.ownerId, state.wars)
      ) {
        const enemyArmies = state.armies.filter(
          (a) => a.provinceId === targetId && a.ownerId === targetProvince.ownerId
        );
        const enemyStrength = enemyArmies.reduce((sum, a) => sum + a.strength, 0);
        const advantage = enemyStrength > 0 ? army.strength / enemyStrength : 2;

        // Only attack with reasonable odds
        if (advantage >= 0.7) {
          const isStrategic = targetProvince.strategicTag === 'Capital' || targetProvince.strategicTag === 'KeyRegion';
          const strategicBonus = isStrategic ? 0.3 : 0;

          candidates.push({
            order: {
              type: 'move_army',
              nationId: nation.id,
              armyId: army.id,
              fromProvinceId: army.provinceId,
              toProvinceId: targetId,
            },
            category: 'military',
            score: weights.militaryAction * 0.4 +
              weights.territoryGain * Math.min(1, advantage * 0.3) +
              strategicBonus,
          });
        }
      }

      // --- Take rebel/unowned provinces ---
      if (targetProvince.ownerId === 'rebel' || targetProvince.ownerId === null) {
        candidates.push({
          order: {
            type: 'move_army',
            nationId: nation.id,
            armyId: army.id,
            fromProvinceId: army.provinceId,
            toProvinceId: targetId,
          },
          category: 'military',
          score: weights.territoryGain * 0.6,
        });
      }

      // --- Defensive repositioning ---
      // Move to own border provinces that are threatened
      if (targetProvince.ownerId === nation.id) {
        const isBorder = getAdjacentProvinceIds(targetId, state).some((adjId) => {
          const adj = state.provinces.find((ap) => ap.id === adjId);
          return adj && adj.ownerId !== nation.id && adj.ownerId !== null;
        });
        const isThreatened = state.armies.some((a) => {
          if (a.ownerId === nation.id) return false;
          const adjToTarget = getAdjacentProvinceIds(targetId, state);
          return adjToTarget.includes(a.provinceId) && areAtWar(nation.id, a.ownerId, state.wars);
        });
        const hasHighUnrest = targetProvince.unrest >= 50;

        if (isThreatened) {
          candidates.push({
            order: {
              type: 'move_army',
              nationId: nation.id,
              armyId: army.id,
              fromProvinceId: army.provinceId,
              toProvinceId: targetId,
            },
            category: 'military',
            score: weights.defensivePosture * 0.7,
          });
        } else if (isBorder && currentProvince?.ownerId === nation.id && !isBorderProvince(currentProvince.id, nation.id, state)) {
          // Reposition interior army to border
          candidates.push({
            order: {
              type: 'move_army',
              nationId: nation.id,
              armyId: army.id,
              fromProvinceId: army.provinceId,
              toProvinceId: targetId,
            },
            category: 'military',
            score: weights.defensivePosture * 0.3,
          });
        } else if (hasHighUnrest) {
          // Garrison to suppress unrest
          candidates.push({
            order: {
              type: 'move_army',
              nationId: nation.id,
              armyId: army.id,
              fromProvinceId: army.provinceId,
              toProvinceId: targetId,
            },
            category: 'military',
            score: weights.defensivePosture * 0.4,
          });
        }
      }
    }

    // --- Blockade (Naval armies only) ---
    if (army.type === 'Naval') {
      for (const edge of state.edges) {
        const involvesArmy =
          edge.sourceId === army.provinceId || edge.targetId === army.provinceId;
        if (!involvesArmy || !edge.tradeActive) continue;

        const source = state.provinces.find((p) => p.id === edge.sourceId);
        const target = state.provinces.find((p) => p.id === edge.targetId);
        if (!source || !target) continue;

        // Only blockade enemy trade routes
        const enemyTrade =
          (source.ownerId && areAtWar(nation.id, source.ownerId, state.wars)) ||
          (target.ownerId && areAtWar(nation.id, target.ownerId, state.wars));

        if (enemyTrade) {
          candidates.push({
            order: {
              type: 'blockade',
              nationId: nation.id,
              armyId: army.id,
              edgeSourceId: edge.sourceId,
              edgeTargetId: edge.targetId,
            },
            category: 'military',
            score: weights.navalAction * 0.6,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Check if a province is on the border of a nation's territory.
 */
function isBorderProvince(provinceId: string, nationId: string, state: GameState): boolean {
  return getAdjacentProvinceIds(provinceId, state).some((adjId) => {
    const adj = state.provinces.find((p) => p.id === adjId);
    return adj && adj.ownerId !== nationId;
  });
}

// ---------------------------------------------------------------------------
// Generate construction action candidates
// ---------------------------------------------------------------------------

function generateConstructionCandidates(
  nation: Nation,
  context: GameContext
): ActionCandidate[] {
  const { state } = context;
  const weights = nation.utilityWeights;
  const candidates: ActionCandidate[] = [];
  const ownedProvinces = state.provinces.filter((p) => p.ownerId === nation.id);

  for (const province of ownedProvinces) {
    // --- Upgrade dev ---
    if (province.devLevel < 5) {
      const cost = province.devLevel * 10;
      const canAfford = nation.resources.gold >= cost && nation.resources.production >= cost;

      if (canAfford) {
        // Higher value for lower-dev provinces (more efficient)
        const efficiency = (6 - province.devLevel) / 5;

        candidates.push({
          order: {
            type: 'upgrade_dev',
            nationId: nation.id,
            provinceId: province.id,
          },
          category: 'construction',
          score: weights.economicDev * efficiency * 0.7,
        });
      }
    }

    // --- Set focus (devLevel >= 2, no focus or suboptimal focus) ---
    if (province.devLevel >= 2 && province.focus === null) {
      const bestFocus = pickBestFocus(nation, state);
      candidates.push({
        order: {
          type: 'set_focus',
          nationId: nation.id,
          provinceId: province.id,
          focus: bestFocus,
        },
        category: 'construction',
        score: weights.economicDev * 0.8, // High priority — no focus means wasted potential
      });
    }

    // --- Build fort on border provinces ---
    if (province.fortLevel < 3) {
      const onBorder = isBorderProvince(province.id, nation.id, state);
      const fortCost = (province.fortLevel + 1) * 15;
      const canAfford = nation.resources.production >= fortCost;

      if (onBorder && canAfford) {
        const isStrategic = province.strategicTag === 'Capital' || province.strategicTag === 'KeyRegion';
        const strategicBonus = isStrategic ? 0.3 : 0;

        candidates.push({
          order: {
            type: 'build_fort',
            nationId: nation.id,
            provinceId: province.id,
          },
          category: 'construction',
          score: weights.defensivePosture * 0.4 + strategicBonus,
        });
      }
    }
  }

  return candidates;
}

/**
 * Choose the best focus for a new province based on nation needs.
 */
function pickBestFocus(nation: Nation, state: GameState): ProvinceFocus {
  const ownedProvinces = state.provinces.filter((p) => p.ownerId === nation.id);

  // Count existing focuses
  const focusCounts: Record<ProvinceFocus, number> = {
    Agricultural: 0,
    Industrial: 0,
    Commercial: 0,
    Military: 0,
  };
  for (const p of ownedProvinces) {
    if (p.focus) focusCounts[p.focus]++;
  }

  // Determine need based on resources
  const res = nation.resources;
  const atWar = state.wars.some(
    (w) => w.aggressorId === nation.id || w.defenderId === nation.id
  );

  // Prioritize based on scarcity
  if (res.food < 10) return 'Agricultural';
  if (atWar && res.manpower < 20) return 'Military';
  if (res.production < 15) return 'Industrial';

  // Otherwise balance based on archetype weights
  const weights = nation.utilityWeights;
  const focusScores: [ProvinceFocus, number][] = [
    ['Agricultural', 0.3 - focusCounts.Agricultural * 0.1],
    ['Industrial', weights.economicDev * 0.5 - focusCounts.Industrial * 0.1],
    ['Commercial', weights.tradeDeal * 0.5 - focusCounts.Commercial * 0.1],
    ['Military', weights.militaryAction * 0.5 - focusCounts.Military * 0.1],
  ];

  focusScores.sort((a, b) => b[1] - a[1]);
  return focusScores[0][0];
}

// ---------------------------------------------------------------------------
// Generate wildcard action candidates
// ---------------------------------------------------------------------------

function generateWildcardCandidates(
  nation: Nation,
  context: GameContext
): ActionCandidate[] {
  const { state } = context;
  const candidates: ActionCandidate[] = [];
  const atWar = state.wars.some(
    (w) => w.aggressorId === nation.id || w.defenderId === nation.id
  );

  // --- Spy on threatening neighbors ---
  const neighborIds = getNeighborNationIds(nation.id, state);
  for (const targetId of neighborIds) {
    const relation = nation.relations[targetId] ?? 0;
    if (relation >= 0) continue;

    // Pick the least-known intel track
    const intel = nation.intelOf[targetId];
    const tracks: ('military' | 'economic' | 'diplomatic' | 'political')[] = [
      'military', 'economic', 'diplomatic', 'political',
    ];
    const hiddenTrack = tracks.find(
      (t) => !intel || intel[t] === 'Hidden'
    );
    const approximateTrack = tracks.find(
      (t) => intel && intel[t] === 'Approximate'
    );
    const bestTrack = hiddenTrack ?? approximateTrack;

    if (bestTrack) {
      const threatFactor = Math.abs(relation) / 100;
      candidates.push({
        order: {
          type: 'spy',
          nationId: nation.id,
          targetNationId: targetId,
          intelTrack: bestTrack,
        },
        category: 'wildcard',
        score: 0.4 + threatFactor * 0.3,
      });
    }
  }

  // --- Hire mercenaries (at war + low manpower) ---
  if (atWar && nation.resources.manpower < 10 && nation.resources.gold >= 30) {
    candidates.push({
      order: {
        type: 'hire_mercenaries',
        nationId: nation.id,
        goldCost: 30,
        manpowerGain: 15,
      },
      category: 'wildcard',
      score: 0.7,
    });
  }

  // --- Restore eliminated allies ---
  for (const eliminated of state.nations) {
    if (eliminated.eliminatedOnTurn === undefined) continue;
    if (eliminated.exileWindowExpires === undefined) continue;
    if (state.turn > eliminated.exileWindowExpires) continue;

    const relation = nation.relations[eliminated.id] ?? 0;
    if (relation < 20) continue;
    if (nation.resources.influence < state.scenario.meta.exileRestoreCost) continue;

    candidates.push({
      order: {
        type: 'restore_nation',
        nationId: nation.id,
        targetNationId: eliminated.id,
      },
      category: 'wildcard',
      score: nation.utilityWeights.allianceBuilding * 0.5 + (relation / 100) * 0.3,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Select best candidates within budget
// ---------------------------------------------------------------------------

function selectOrders(
  candidates: ActionCandidate[],
  budget: ActionBudget,
  nation: Nation
): Order[] {
  const selected: Order[] = [];
  const usedArmyIds = new Set<string>();
  const usedProvinceIds = new Set<string>();

  // Group by category
  const diplomatic = candidates.filter((c) => c.category === 'diplomatic');
  const military = candidates.filter((c) => c.category === 'military');
  const construction = candidates.filter((c) => c.category === 'construction');
  const wildcard = candidates.filter((c) => c.category === 'wildcard');

  // Sort each group by score descending
  diplomatic.sort((a, b) => b.score - a.score);
  military.sort((a, b) => b.score - a.score);
  construction.sort((a, b) => b.score - a.score);
  wildcard.sort((a, b) => b.score - a.score);

  // Select diplomatic orders (up to budget, overflow costs Influence)
  let diploUsed = 0;
  const maxDiploOrders = budget.diplomatic + (nation.resources.influence >= 20 ? 1 : 0);
  for (const candidate of diplomatic) {
    if (diploUsed >= maxDiploOrders) break;
    // Skip low-scoring candidates
    if (candidate.score < 0.1) continue;
    selected.push(candidate.order);
    diploUsed++;
  }

  // Select military orders (1 per army, no duplicate army usage)
  for (const candidate of military) {
    const order = candidate.order;
    if (order.type === 'move_army' || order.type === 'retreat') {
      if (usedArmyIds.has(order.armyId)) continue;
      usedArmyIds.add(order.armyId);
    } else if (order.type === 'blockade') {
      if (usedArmyIds.has(order.armyId)) continue;
      usedArmyIds.add(order.armyId);
    }
    if (candidate.score < 0.05) continue;
    selected.push(candidate.order);
  }

  // Select construction orders (1 per province)
  let constructionUsed = 0;
  for (const candidate of construction) {
    if (constructionUsed >= budget.construction) break;
    const order = candidate.order;
    if (order.type === 'upgrade_dev' || order.type === 'set_focus' || order.type === 'build_fort') {
      if (usedProvinceIds.has(order.provinceId)) continue;
      usedProvinceIds.add(order.provinceId);
    }
    if (candidate.score < 0.05) continue;
    selected.push(candidate.order);
    constructionUsed++;
  }

  // Select wildcard order (at most 1)
  if (wildcard.length > 0 && wildcard[0].score >= 0.1) {
    selected.push(wildcard[0].order);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Main entry point: generate all orders for one NPC nation
// ---------------------------------------------------------------------------

/**
 * Generate orders for an NPC nation using utility-based scoring.
 * Returns the same Order[] types that a player would submit.
 * Pure function: reads state, returns orders.
 */
export function generateNpcOrders(nationId: string, state: GameState): Order[] {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation || nation.eliminatedOnTurn !== undefined) return [];

  const context: GameContext = {
    state,
    currentNationId: nationId,
    turn: state.turn,
  };

  const budget = computeActionBudget(nationId, state);

  // Generate all candidate actions
  const diplomaticCandidates = generateDiplomaticCandidates(nation, context);
  const militaryCandidates = generateMilitaryCandidates(nation, context);
  const constructionCandidates = generateConstructionCandidates(nation, context);
  const wildcardCandidates = generateWildcardCandidates(nation, context);

  // Apply modifiers and agenda multiplier to each candidate
  const allCandidates = [
    ...diplomaticCandidates,
    ...militaryCandidates,
    ...constructionCandidates,
    ...wildcardCandidates,
  ].map((candidate) => {
    const isBetrayal =
      candidate.order.type === 'declare_war' ||
      candidate.order.type === 'break_agreement';
    let isNaval = candidate.order.type === 'blockade';
    if (candidate.order.type === 'move_army') {
      const moveOrder = candidate.order;
      const matchedArmy = state.armies.find((a) => a.id === moveOrder.armyId);
      isNaval = matchedArmy?.type === 'Naval' || false;
    }

    let score = applyModifiers(
      candidate.score,
      context,
      nation,
      candidate.category,
      isBetrayal,
      isNaval
    );

    // Apply agenda multiplier
    score *= getAgendaMultiplier(candidate.order, nation, state);

    return { ...candidate, score };
  });

  return selectOrders(allCandidates, budget, nation);
}

// ---------------------------------------------------------------------------
// Convenience: generate orders for ALL NPC nations in one call
// ---------------------------------------------------------------------------

/**
 * Generate orders for all non-player NPC nations.
 * Returns a Record mapping nationId → Order[].
 */
export function generateAllNpcOrders(
  state: GameState,
  playerNationId: string
): Record<string, Order[]> {
  const orders: Record<string, Order[]> = {};

  for (const nation of state.nations) {
    if (nation.id === playerNationId) continue;
    if (nation.eliminatedOnTurn !== undefined) continue;
    orders[nation.id] = generateNpcOrders(nation.id, state);
  }

  return orders;
}
