import type {
  GameState,
  Nation,
  Province,
  Edge,
  Army,
  War,
  Order,
  DiplomaticOrder,
  ConstructionOrder,
  WildcardOrder,
  MoveArmyOrder,
  BlockadeOrder,
  DeclareWarOrder,
  OfferPeaceOrder,
  ProposeAgreementOrder,
  BreakAgreementOrder,
  UpgradeDevOrder,
  SetFocusOrder,
  BuildFortOrder,
  SpyOrder,
  RestoreNationOrder,
  HireMercenariesOrder,
  ConflictReport,
  ConflictReportEntry,
  FiredEvent,
  TurnLog,
  EliminationRecord,
  DevLevel,
  Scenario,
  CombatParams,
  GameEvent,
} from '../types';

import { resolveCombat, getTerrainModifier, getFortBonus } from './combat';
import {
  runBookkeeping,
} from './economics';
import {
  createAgreement,
  breakAgreement,
  createWar,
  areAtWar,
  hasActiveAgreement,
  getAllianceAutoJoiners,
  activateTradeRoutes,
  deactivateTradeRoutes,
  modifyRelation,
  applyRelationDecay,
  expireAgreements,
  updateIntelFromAgreements,
} from './diplomacy';
import { evaluateAndApplyEvents } from './events';

// ---------------------------------------------------------------------------
// CONFLICT_PRIORITY — Convention #6: named constant, auditable at a glance.
// Every WEGO collision rule lives here. Never inlined or moved elsewhere.
// ---------------------------------------------------------------------------

export const CONFLICT_PRIORITY = {
  /** P1: Peace offers beat war declarations (same-turn paradox → peaceful resolution) */
  PEACE_OVER_WAR: 1,

  /** P2: Defender beats attacker in province-swap (armies cross paths → battle in defender's origin) */
  DEFENDER_SWAP: 2,

  /** P3: Blockade beats trade route activation (naval blockade cancels tradeActive on edge) */
  BLOCKADE_OVER_TRADE: 3,

  /** P4: Earlier-queued diplomatic agreement beats later one for the same nation pair */
  AGREEMENT_QUEUE_ORDER: 4,

  /** P5: Two armies simultaneously moving into the same empty province → both halt; contest next turn */
  SIMULTANEOUS_ENTRY: 5,

  /** P6: Two nations simultaneously declaring war on same third nation → both wars valid;
   *  resolve sequentially ordered by aggressor military strength (highest first) */
  SIMULTANEOUS_WAR: 6,

  /** P7: Two nations simultaneously proposing alliance to same third nation →
   *  higher relation score wins; other declined and logged */
  ALLIANCE_TIEBREAK: 7,
} as const;

// ---------------------------------------------------------------------------
// Order classification helpers
// ---------------------------------------------------------------------------

function isDiplomaticOrder(order: Order): order is DiplomaticOrder {
  return ['propose_agreement', 'break_agreement', 'declare_war', 'offer_peace'].includes(order.type);
}

function isConstructionOrder(order: Order): order is ConstructionOrder {
  return ['upgrade_dev', 'set_focus', 'build_fort'].includes(order.type);
}

function isWildcardOrder(order: Order): order is WildcardOrder {
  return ['spy', 'restore_nation', 'hire_mercenaries'].includes(order.type);
}

// ---------------------------------------------------------------------------
// Phase 2: Diplomatic resolution
// ---------------------------------------------------------------------------

interface DiplomaticPhaseResult {
  nations: Nation[];
  wars: War[];
  edges: Edge[];
  entries: ConflictReportEntry[];
}

function resolveDiplomaticPhase(
  allOrders: Record<string, Order[]>,
  nations: Nation[],
  wars: War[],
  edges: Edge[],
  provinces: Province[],
  turn: number,
  scenario: Scenario
): DiplomaticPhaseResult {
  let currentNations = [...nations];
  let currentWars = [...wars];
  let currentEdges = [...edges];
  const entries: ConflictReportEntry[] = [];

  // Collect all diplomatic orders
  const diploOrders: DiplomaticOrder[] = [];
  for (const nationId of Object.keys(allOrders)) {
    for (const order of allOrders[nationId]) {
      if (isDiplomaticOrder(order)) {
        diploOrders.push(order);
      }
    }
  }

  // --- P1: Peace offers beat war declarations ---
  const peaceOffers = diploOrders.filter((o): o is OfferPeaceOrder => o.type === 'offer_peace');
  const warDeclarations = diploOrders.filter((o): o is DeclareWarOrder => o.type === 'declare_war');

  // Find mutual peace offers (both sides offer peace)
  const resolvedPeacePairs = new Set<string>();
  for (const offer of peaceOffers) {
    const mutual = peaceOffers.find(
      (o) => o.nationId === offer.targetNationId && o.targetNationId === offer.nationId
    );
    if (mutual) {
      const pairKey = [offer.nationId, offer.targetNationId].sort().join('_');
      if (!resolvedPeacePairs.has(pairKey)) {
        resolvedPeacePairs.add(pairKey);
        // Remove the war
        currentWars = currentWars.filter(
          (w) =>
            !((w.aggressorId === offer.nationId && w.defenderId === offer.targetNationId) ||
              (w.aggressorId === offer.targetNationId && w.defenderId === offer.nationId))
        );
        // Improve relations
        const [a, b] = findNationPair(currentNations, offer.nationId, offer.targetNationId);
        if (a && b) {
          const [updA, updB] = modifyRelation(a, b, 15);
          currentNations = replaceNations(currentNations, [updA, updB]);
        }
        entries.push({
          type: 'peace_over_war',
          involvedNations: [offer.nationId, offer.targetNationId],
          description: `Mutual peace accepted between ${offer.nationId} and ${offer.targetNationId}`,
          resolution: 'War ended. Peace offers override any war declarations this turn.',
        });
      }
    }
  }

  // Filter out war declarations against nations we just made peace with
  const filteredWarDeclarations = warDeclarations.filter((wd) => {
    const pairKey = [wd.nationId, wd.targetNationId].sort().join('_');
    if (resolvedPeacePairs.has(pairKey)) {
      entries.push({
        type: 'peace_over_war',
        involvedNations: [wd.nationId, wd.targetNationId],
        description: `War declaration by ${wd.nationId} against ${wd.targetNationId} overridden by peace`,
        resolution: 'Peace offer took priority (P1).',
      });
      return false;
    }
    return true;
  });

  // --- P7: Alliance proposal tiebreak ---
  const proposals = diploOrders.filter(
    (o): o is ProposeAgreementOrder => o.type === 'propose_agreement'
  );

  // Group alliance proposals by target nation
  const allianceProposalsByTarget = new Map<string, ProposeAgreementOrder[]>();
  for (const p of proposals) {
    if (p.agreementType === 'MilitaryAlliance') {
      const existing = allianceProposalsByTarget.get(p.targetNationId) ?? [];
      existing.push(p);
      allianceProposalsByTarget.set(p.targetNationId, existing);
    }
  }

  const declinedProposals = new Set<ProposeAgreementOrder>();
  for (const [targetId, competing] of allianceProposalsByTarget) {
    if (competing.length > 1) {
      const targetNation = currentNations.find((n) => n.id === targetId);
      if (targetNation) {
        // Sort by relation score descending — highest wins
        competing.sort(
          (a, b) =>
            (targetNation.relations[b.nationId] ?? 0) - (targetNation.relations[a.nationId] ?? 0)
        );
        // All but the first are declined
        for (let i = 1; i < competing.length; i++) {
          declinedProposals.add(competing[i]);
          entries.push({
            type: 'alliance_proposal_tiebreak',
            involvedNations: [competing[i].nationId, targetId],
            description: `Alliance proposal from ${competing[i].nationId} to ${targetId} declined`,
            resolution: `${competing[0].nationId} had higher relation score (P7).`,
          });
        }
      }
    }
  }

  // --- P4: Process agreements in queue order ---
  const processedPairs = new Set<string>();
  for (const proposal of proposals) {
    if (declinedProposals.has(proposal)) continue;

    const pairKey = [proposal.nationId, proposal.targetNationId].sort().join('_') + '_' + proposal.agreementType;
    if (processedPairs.has(pairKey)) {
      entries.push({
        type: 'agreement_priority',
        involvedNations: [proposal.nationId, proposal.targetNationId],
        description: `Duplicate ${proposal.agreementType} proposal between ${proposal.nationId} and ${proposal.targetNationId}`,
        resolution: 'Earlier-queued agreement took priority (P4).',
      });
      continue;
    }
    processedPairs.add(pairKey);

    const [a, b] = findNationPair(currentNations, proposal.nationId, proposal.targetNationId);
    if (a && b) {
      const [updA, updB] = createAgreement(
        a,
        b,
        proposal.agreementType,
        turn,
        proposal.duration ?? null
      );
      currentNations = replaceNations(currentNations, [updA, updB]);

      // Activate trade routes for new Trade Deals
      if (proposal.agreementType === 'TradeDeal') {
        currentEdges = activateTradeRoutes(currentEdges, provinces, a.id, b.id);
      }
    }
  }

  // --- Process break agreements ---
  const breakOrders = diploOrders.filter(
    (o): o is BreakAgreementOrder => o.type === 'break_agreement'
  );
  for (const order of breakOrders) {
    const [a, b] = findNationPair(currentNations, order.nationId, order.targetNationId);
    if (a && b) {
      const [updA, updB] = breakAgreement(a, b, order.agreementType);
      currentNations = replaceNations(currentNations, [updA, updB]);

      if (order.agreementType === 'TradeDeal') {
        currentEdges = deactivateTradeRoutes(currentEdges, provinces, a.id, b.id);
      }
    }
  }

  // --- P6: War declarations (simultaneous wars against same target) ---
  // Group by target
  const warsByTarget = new Map<string, DeclareWarOrder[]>();
  for (const wd of filteredWarDeclarations) {
    const existing = warsByTarget.get(wd.targetNationId) ?? [];
    existing.push(wd);
    warsByTarget.set(wd.targetNationId, existing);
  }

  for (const [targetId, declarations] of warsByTarget) {
    if (declarations.length > 1) {
      // Sort by aggressor military strength (highest first)
      declarations.sort((a, b) => {
        const strA = getArmyStrength(a.nationId, []);  // Will use armies from state
        const strB = getArmyStrength(b.nationId, []);
        return strB - strA;
      });
      entries.push({
        type: 'simultaneous_war_declaration',
        involvedNations: [targetId, ...declarations.map((d) => d.nationId)],
        description: `Multiple nations declared war on ${targetId} simultaneously`,
        resolution: 'All wars valid; resolved sequentially by aggressor strength (P6).',
      });
    }

    for (const wd of declarations) {
      const aggressor = currentNations.find((n) => n.id === wd.nationId);
      if (!aggressor) continue;

      if (!areAtWar(wd.nationId, targetId, currentWars)) {
        // Breaking NAP if one exists
        if (hasActiveAgreement(aggressor, targetId, 'NonAggressionPact')) {
          const target = currentNations.find((n) => n.id === targetId);
          if (target) {
            const [updA, updB] = breakAgreement(aggressor, target, 'NonAggressionPact');
            currentNations = replaceNations(currentNations, [updA, updB]);
          }
        }

        currentWars.push(createWar(wd.nationId, targetId, turn));

        // Relation penalty for declaring war
        const [a, b] = findNationPair(currentNations, wd.nationId, targetId);
        if (a && b) {
          const [updA, updB] = modifyRelation(a, b, -30);
          currentNations = replaceNations(currentNations, [updA, updB]);
        }

        // Alliance auto-join
        const joiners = getAllianceAutoJoiners(targetId, wd.nationId, currentNations, currentWars);
        for (const joinerId of joiners) {
          if (!areAtWar(joinerId, wd.nationId, currentWars)) {
            currentWars.push(createWar(joinerId, wd.nationId, turn));
          }
        }
      }
    }
  }

  // Expire agreements
  currentNations = currentNations.map((n) => expireAgreements(n, turn));

  // Apply relation decay
  currentNations = applyRelationDecay(currentNations, scenario.meta.relationDecayPerTurn);

  return { nations: currentNations, wars: currentWars, edges: currentEdges, entries };
}

// ---------------------------------------------------------------------------
// Phase 3: Military movement
// ---------------------------------------------------------------------------

interface MovementPhaseResult {
  armies: Army[];
  provinces: Province[];
  pendingBattles: PendingBattle[];
  entries: ConflictReportEntry[];
}

interface PendingBattle {
  provinceId: string;
  attackerArmies: Army[];
  defenderArmies: Army[];
  attackerNationId: string;
  defenderNationId: string;
}

function resolveMilitaryMovement(
  allOrders: Record<string, Order[]>,
  armies: Army[],
  provinces: Province[],
  edges: Edge[],
  wars: War[]
): MovementPhaseResult {
  let currentArmies = armies.map((a) => ({ ...a }));
  const currentProvinces = provinces.map((p) => ({ ...p }));
  const entries: ConflictReportEntry[] = [];
  const pendingBattles: PendingBattle[] = [];

  // Collect move orders
  const moveOrders: MoveArmyOrder[] = [];
  const blockadeOrders: BlockadeOrder[] = [];

  for (const nationId of Object.keys(allOrders)) {
    for (const order of allOrders[nationId]) {
      if (order.type === 'move_army') {
        moveOrders.push(order as MoveArmyOrder);
      } else if (order.type === 'blockade') {
        blockadeOrders.push(order as BlockadeOrder);
      }
    }
  }

  // --- P3: Blockades cancel trade routes ---
  for (const blockade of blockadeOrders) {
    const army = currentArmies.find(
      (a) => a.id === blockade.armyId && a.ownerId === blockade.nationId && a.type === 'Naval'
    );
    if (!army) continue;

    // Find matching edge and deactivate trade
    const edgeIdx = edges.findIndex(
      (e) =>
        (e.sourceId === blockade.edgeSourceId && e.targetId === blockade.edgeTargetId) ||
        (e.sourceId === blockade.edgeTargetId && e.targetId === blockade.edgeSourceId)
    );
    if (edgeIdx >= 0) {
      // Edge deactivation is handled by returning updated edges from resolution
      entries.push({
        type: 'blockade_over_trade',
        involvedNations: [blockade.nationId],
        edgeSourceId: blockade.edgeSourceId,
        edgeTargetId: blockade.edgeTargetId,
        description: `Naval blockade by ${blockade.nationId} on edge ${blockade.edgeSourceId}-${blockade.edgeTargetId}`,
        resolution: 'Trade route deactivated (P3).',
      });
    }
  }

  // --- P2: Detect province swaps (armies crossing paths) ---
  const moveDestinations = new Map<string, MoveArmyOrder[]>();
  for (const move of moveOrders) {
    const existing = moveDestinations.get(move.toProvinceId) ?? [];
    existing.push(move);
    moveDestinations.set(move.toProvinceId, existing);
  }

  // Detect swaps: A moves from X→Y while B moves from Y→X
  const swapPairs = new Set<string>();
  for (const moveA of moveOrders) {
    for (const moveB of moveOrders) {
      if (moveA === moveB) continue;
      if (
        moveA.fromProvinceId === moveB.toProvinceId &&
        moveA.toProvinceId === moveB.fromProvinceId &&
        areAtWar(moveA.nationId, moveB.nationId, wars)
      ) {
        const pairKey = [moveA.armyId, moveB.armyId].sort().join('_');
        if (!swapPairs.has(pairKey)) {
          swapPairs.add(pairKey);
          // Battle happens in defender's origin (the province being attacked)
          // Defender = whoever owns the province the attacker is moving into
          const targetProvince = currentProvinces.find((p) => p.id === moveA.toProvinceId);
          const isADefender = targetProvince?.ownerId === moveA.nationId;

          const attackerMove = isADefender ? moveB : moveA;
          const defenderMove = isADefender ? moveA : moveB;

          const attackerArmy = currentArmies.find((a) => a.id === attackerMove.armyId);
          const defenderArmy = currentArmies.find((a) => a.id === defenderMove.armyId);

          if (attackerArmy && defenderArmy) {
            pendingBattles.push({
              provinceId: defenderMove.fromProvinceId,
              attackerArmies: [{ ...attackerArmy }],
              defenderArmies: [{ ...defenderArmy }],
              attackerNationId: attackerMove.nationId,
              defenderNationId: defenderMove.nationId,
            });
            entries.push({
              type: 'defender_swap',
              involvedNations: [attackerMove.nationId, defenderMove.nationId],
              provinceId: defenderMove.fromProvinceId,
              description: `Armies crossed paths between ${moveA.fromProvinceId} and ${moveA.toProvinceId}`,
              resolution: `Battle in defender's origin ${defenderMove.fromProvinceId} (P2).`,
            });
          }
        }
      }
    }
  }

  // --- P5: Two armies moving into same empty province simultaneously ---
  for (const [destId, moves] of moveDestinations) {
    // Only relevant if destination is unowned/empty and multiple hostile armies converge
    const hostileGroups = new Map<string, MoveArmyOrder[]>();
    for (const m of moves) {
      const existing = hostileGroups.get(m.nationId) ?? [];
      existing.push(m);
      hostileGroups.set(m.nationId, existing);
    }

    if (hostileGroups.size > 1) {
      const destProvince = currentProvinces.find((p) => p.id === destId);
      const nationIds = [...hostileGroups.keys()];

      // Check if the converging nations are at war with each other
      const atWarConverging = nationIds.some((a, i) =>
        nationIds.slice(i + 1).some((b) => areAtWar(a, b, wars))
      );

      if (atWarConverging) {
        if (destProvince && (destProvince.ownerId === null || destProvince.ownerId === 'rebel')) {
          // Both halt at border
          for (const m of moves) {
            const armyIdx = currentArmies.findIndex((a) => a.id === m.armyId);
            if (armyIdx >= 0) {
              // Army stays at origin (no move)
            }
          }
          entries.push({
            type: 'simultaneous_entry',
            involvedNations: nationIds,
            provinceId: destId,
            description: `Multiple hostile armies moved into empty province ${destId}`,
            resolution: 'Both halted at border; contest resolves next turn (P5).',
          });
          continue;
        } else {
          // Province is owned — this becomes a battle
          const defenderNationId = destProvince?.ownerId ?? '';
          const attackerMoves = moves.filter((m) => m.nationId !== defenderNationId);
          const defenderMoves = moves.filter((m) => m.nationId === defenderNationId);

          const attackerArmies = attackerMoves
            .map((m) => currentArmies.find((a) => a.id === m.armyId))
            .filter((a): a is Army => a !== undefined);
          const defenderArmies = defenderMoves
            .map((m) => currentArmies.find((a) => a.id === m.armyId))
            .filter((a): a is Army => a !== undefined);

          // Also include stationary defenders in the province
          const stationedDefenders = currentArmies.filter(
            (a) => a.provinceId === destId && a.ownerId === defenderNationId &&
            !defenderArmies.some((d) => d.id === a.id)
          );

          if (attackerArmies.length > 0) {
            pendingBattles.push({
              provinceId: destId,
              attackerArmies,
              defenderArmies: [...defenderArmies, ...stationedDefenders],
              attackerNationId: attackerMoves[0].nationId,
              defenderNationId,
            });
          }
          continue;
        }
      }
    }
  }

  // Execute remaining valid moves (not involved in swaps or simultaneous entries)
  const swapArmyIds = new Set<string>();
  for (const pairKey of swapPairs) {
    for (const id of pairKey.split('_')) {
      swapArmyIds.add(id);
    }
  }

  for (const move of moveOrders) {
    if (swapArmyIds.has(move.armyId)) continue;

    // Check if this move was blocked by P5
    const blocked = entries.some(
      (e) => e.type === 'simultaneous_entry' && e.provinceId === move.toProvinceId
    );
    if (blocked) continue;

    const armyIdx = currentArmies.findIndex(
      (a) => a.id === move.armyId && a.ownerId === move.nationId
    );
    if (armyIdx < 0) continue;

    const army = currentArmies[armyIdx];
    const destProvince = currentProvinces.find((p) => p.id === move.toProvinceId);
    if (!destProvince) continue;

    // Check if moving into enemy territory (battle)
    if (
      destProvince.ownerId !== null &&
      destProvince.ownerId !== 'rebel' &&
      destProvince.ownerId !== move.nationId &&
      areAtWar(move.nationId, destProvince.ownerId, wars)
    ) {
      const defenders = currentArmies.filter(
        (a) => a.provinceId === move.toProvinceId && a.ownerId === destProvince.ownerId
      );
      pendingBattles.push({
        provinceId: move.toProvinceId,
        attackerArmies: [{ ...army }],
        defenderArmies: defenders.map((d) => ({ ...d })),
        attackerNationId: move.nationId,
        defenderNationId: destProvince.ownerId,
      });
      // Move the army (it enters the province for battle)
      currentArmies[armyIdx] = { ...army, provinceId: move.toProvinceId, siegeTurns: 0 };
    } else {
      // Peaceful move
      currentArmies[armyIdx] = { ...army, provinceId: move.toProvinceId, siegeTurns: 0 };
    }
  }

  // Handle retreats
  for (const nationId of Object.keys(allOrders)) {
    for (const order of allOrders[nationId]) {
      if (order.type === 'retreat') {
        const armyIdx = currentArmies.findIndex(
          (a) => a.id === order.armyId && a.ownerId === order.nationId
        );
        if (armyIdx >= 0) {
          currentArmies[armyIdx] = {
            ...currentArmies[armyIdx],
            provinceId: order.toProvinceId,
            siegeTurns: 0,
          };
        }
      }
    }
  }

  return { armies: currentArmies, provinces: currentProvinces, pendingBattles, entries };
}

// ---------------------------------------------------------------------------
// Phase 4: Combat resolution
// ---------------------------------------------------------------------------

interface CombatPhaseResult {
  armies: Army[];
  provinces: Province[];
  entries: ConflictReportEntry[];
}

function resolveCombatPhase(
  pendingBattles: PendingBattle[],
  armies: Army[],
  provinces: Province[],
  scenario: Scenario,
  turn: number
): CombatPhaseResult {
  let currentArmies = [...armies];
  let currentProvinces = [...provinces];
  const entries: ConflictReportEntry[] = [];

  for (const battle of pendingBattles) {
    const province = currentProvinces.find((p) => p.id === battle.provinceId);
    if (!province) continue;

    const attackerStrength = battle.attackerArmies.reduce((sum, a) => sum + a.strength, 0);
    const defenderStrength = battle.defenderArmies.reduce((sum, a) => sum + a.strength, 0);

    if (attackerStrength <= 0 && defenderStrength <= 0) continue;

    const fortBonus = getFortBonus(province.fortLevel);
    const terrainMod = getTerrainModifier(province.terrain);

    // Determine if major battle
    const combinedStrength = attackerStrength + defenderStrength;
    const majorThreshold = scenario.meta.majorBattleThreshold ?? 50;
    const isCapitalOrKey =
      province.strategicTag === 'Capital' || province.strategicTag === 'KeyRegion';
    const isMajor = combinedStrength > majorThreshold || isCapitalOrKey;

    // Seed from turn + province id hash for determinism
    const seed = hashSeed(turn, battle.provinceId);

    const params: CombatParams = {
      attackerStrength,
      defenderStrength,
      fortBonus,
      terrainModifier: terrainMod,
      seed,
    };

    const result = resolveCombat(params, isMajor);

    // Apply casualties
    currentArmies = applyCasualties(
      currentArmies,
      battle.attackerArmies.map((a) => a.id),
      result.attackerCasualties
    );
    currentArmies = applyCasualties(
      currentArmies,
      battle.defenderArmies.map((a) => a.id),
      result.defenderCasualties
    );

    // Remove eliminated armies (strength <= 0)
    currentArmies = currentArmies.filter((a) => a.strength > 0);

    // Province ownership changes if attacker wins and no defenders remain
    if (result.winner === 'attacker') {
      const remainingDefenders = currentArmies.filter(
        (a) => a.provinceId === battle.provinceId && a.ownerId === battle.defenderNationId
      );
      if (remainingDefenders.length === 0) {
        currentProvinces = currentProvinces.map((p) =>
          p.id === battle.provinceId
            ? { ...p, ownerId: battle.attackerNationId }
            : p
        );
      }
    }

    entries.push({
      type: 'battle',
      involvedNations: [battle.attackerNationId, battle.defenderNationId],
      provinceId: battle.provinceId,
      description: `Battle at ${province.name}: ${battle.attackerNationId} (${attackerStrength}) vs ${battle.defenderNationId} (${defenderStrength})`,
      resolution: `${result.winner} won (${result.rounds} round${result.rounds > 1 ? 's' : ''}). Casualties: attacker ${result.attackerCasualties}, defender ${result.defenderCasualties}.`,
    });
  }

  return { armies: currentArmies, provinces: currentProvinces, entries };
}

/**
 * Distribute casualties proportionally across multiple armies.
 */
function applyCasualties(
  armies: Army[],
  armyIds: string[],
  totalCasualties: number
): Army[] {
  const totalStrength = armies
    .filter((a) => armyIds.includes(a.id))
    .reduce((sum, a) => sum + a.strength, 0);

  if (totalStrength <= 0 || totalCasualties <= 0) return armies;

  return armies.map((army) => {
    if (!armyIds.includes(army.id)) return army;
    const proportion = army.strength / totalStrength;
    const casualties = Math.round(totalCasualties * proportion);
    return { ...army, strength: Math.max(0, army.strength - casualties) };
  });
}

// ---------------------------------------------------------------------------
// Phase 5: Bookkeeping
// ---------------------------------------------------------------------------

interface BookkeepingResult {
  nations: Nation[];
  provinces: Province[];
  armies: Army[];
  wars: War[];
  firedEvents: FiredEvent[];
  eliminations: EliminationRecord[];
  winner: string | null;
}

function resolveBookkeeping(
  state: GameState,
  eventLibrary: GameEvent[]
): BookkeepingResult {
  let currentState = { ...state };
  const eliminations: EliminationRecord[] = [];

  // 5a. Resource income — run bookkeeping for each nation
  const updatedNations = currentState.nations.map((nation) => {
    if (nation.eliminatedOnTurn !== undefined) return nation;
    const newResources = runBookkeeping(nation, currentState);
    return { ...nation, resources: newResources };
  });
  currentState = { ...currentState, nations: updatedNations };

  // 5b. Resource consumption already handled in runBookkeeping

  // 5c. Unrest modifiers
  let currentProvinces = currentState.provinces.map((province) => {
    if (province.ownerId === null || province.ownerId === 'rebel') return province;

    let unrestDelta = 0;

    // Province occupied by foreign army
    const foreignArmy = currentState.armies.some(
      (a) => a.provinceId === province.id && a.ownerId !== province.ownerId
    );
    if (foreignArmy) unrestDelta += 8;

    // No friendly army present
    const friendlyArmy = currentState.armies.some(
      (a) => a.provinceId === province.id && a.ownerId === province.ownerId
    );
    if (!friendlyArmy) {
      unrestDelta += 2;
    } else {
      // Friendly army garrisoned: reduce unrest
      unrestDelta -= 5;
    }

    // Dev level >= 3 stability bonus
    if (province.devLevel >= 3) {
      unrestDelta -= 1;
    }

    const newUnrest = Math.max(0, Math.min(100, province.unrest + unrestDelta));
    return { ...province, unrest: newUnrest };
  });
  currentState = { ...currentState, provinces: currentProvinces };

  // 5d. Condition-triggered events
  const eventResult = evaluateAndApplyEvents(currentState, eventLibrary);
  currentState = eventResult.state;

  // 5e. Rebellion resolution (unrest = 100)
  currentProvinces = currentState.provinces.map((province) => {
    if (province.unrest >= 100 && province.ownerId !== 'rebel' && province.ownerId !== null) {
      return { ...province, ownerId: 'rebel', unrest: 0 };
    }
    return province;
  });

  // Rebel provinces apply +5 unrest to adjacent owned provinces
  const rebelProvinceIds = new Set(
    currentProvinces.filter((p) => p.ownerId === 'rebel').map((p) => p.id)
  );
  if (rebelProvinceIds.size > 0) {
    const adjacentToRebel = new Set<string>();
    for (const edge of currentState.edges) {
      if (rebelProvinceIds.has(edge.sourceId)) adjacentToRebel.add(edge.targetId);
      if (rebelProvinceIds.has(edge.targetId)) adjacentToRebel.add(edge.sourceId);
    }
    currentProvinces = currentProvinces.map((p) => {
      if (adjacentToRebel.has(p.id) && p.ownerId !== null && p.ownerId !== 'rebel') {
        return { ...p, unrest: Math.min(100, p.unrest + 5) };
      }
      return p;
    });
  }
  currentState = { ...currentState, provinces: currentProvinces };

  // 5f. Nation elimination check
  let currentNations = currentState.nations.map((nation) => {
    if (nation.eliminatedOnTurn !== undefined) return nation;

    const ownedCount = currentState.provinces.filter((p) => p.ownerId === nation.id).length;
    if (ownedCount === 0) {
      const record: EliminationRecord = {
        nationId: nation.id,
        eliminatedOnTurn: currentState.turn,
        eliminatorId: findEliminator(nation.id, currentState.wars),
        activeAgreementsAtTime: getActiveAgreementDescriptions(nation),
      };
      eliminations.push(record);

      return {
        ...nation,
        eliminatedOnTurn: currentState.turn,
        exileWindowExpires: currentState.turn + currentState.scenario.meta.exileWindowTurns,
      };
    }
    return nation;
  });

  // Update intel from agreements
  currentNations = currentNations.map((n) =>
    n.eliminatedOnTurn !== undefined ? n : updateIntelFromAgreements(n, currentNations)
  );

  // Update siege counters for armies in enemy fortified provinces
  let currentArmies = currentState.armies.map((army) => {
    const province = currentState.provinces.find((p) => p.id === army.provinceId);
    if (
      province &&
      province.ownerId !== army.ownerId &&
      province.ownerId !== null &&
      province.ownerId !== 'rebel' &&
      province.fortLevel > 0
    ) {
      return { ...army, siegeTurns: army.siegeTurns + 1 };
    }
    return { ...army, siegeTurns: 0 };
  });

  // Siege resolution: reduce fort level after N consecutive turns
  const siegeTurnsRequired = currentState.scenario.meta.siegeTurns;
  for (const army of currentArmies) {
    if (army.siegeTurns >= siegeTurnsRequired) {
      currentProvinces = currentState.provinces.map((p) => {
        if (p.id === army.provinceId && p.fortLevel > 0) {
          return { ...p, fortLevel: p.fortLevel - 1 };
        }
        return p;
      });
      // Reset siege counter
      currentArmies = currentArmies.map((a) =>
        a.id === army.id ? { ...a, siegeTurns: 0 } : a
      );
    }
  }

  // 5g. Victory condition check
  const winner = checkVictoryConditions(
    { ...currentState, nations: currentNations, provinces: currentProvinces },
    currentState.scenario
  );

  return {
    nations: currentNations,
    provinces: currentProvinces,
    armies: currentArmies,
    wars: currentState.wars,
    firedEvents: eventResult.firedEvents,
    eliminations,
    winner,
  };
}

// ---------------------------------------------------------------------------
// Construction phase
// ---------------------------------------------------------------------------

function resolveConstruction(
  allOrders: Record<string, Order[]>,
  provinces: Province[],
  nations: Nation[],
  _scenario: Scenario
): { provinces: Province[]; nations: Nation[] } {
  let currentProvinces = [...provinces];
  let currentNations = [...nations];

  for (const nationId of Object.keys(allOrders)) {
    for (const order of allOrders[nationId]) {
      if (!isConstructionOrder(order)) continue;

      switch (order.type) {
        case 'upgrade_dev': {
          const o = order as UpgradeDevOrder;
          currentProvinces = currentProvinces.map((p) => {
            if (p.id === o.provinceId && p.ownerId === o.nationId && p.devLevel < 5) {
              return { ...p, devLevel: (p.devLevel + 1) as DevLevel };
            }
            return p;
          });
          // Deduct cost: Gold + Production scaled to current dev level
          currentNations = currentNations.map((n) => {
            if (n.id === o.nationId) {
              const province = provinces.find((p) => p.id === o.provinceId);
              if (!province) return n;
              const cost = province.devLevel * 10; // Cost scales with current level
              return {
                ...n,
                resources: {
                  ...n.resources,
                  gold: n.resources.gold - cost,
                  production: n.resources.production - cost,
                },
              };
            }
            return n;
          });
          break;
        }
        case 'set_focus': {
          const o = order as SetFocusOrder;
          currentProvinces = currentProvinces.map((p) => {
            if (p.id === o.provinceId && p.ownerId === o.nationId && p.devLevel >= 2) {
              return { ...p, focus: o.focus };
            }
            return p;
          });
          break;
        }
        case 'build_fort': {
          const o = order as BuildFortOrder;
          currentProvinces = currentProvinces.map((p) => {
            if (p.id === o.provinceId && p.ownerId === o.nationId && p.fortLevel < 3) {
              return { ...p, fortLevel: p.fortLevel + 1 };
            }
            return p;
          });
          // Deduct cost
          currentNations = currentNations.map((n) => {
            if (n.id === o.nationId) {
              const province = provinces.find((p) => p.id === o.provinceId);
              if (!province) return n;
              const cost = (province.fortLevel + 1) * 15;
              return {
                ...n,
                resources: {
                  ...n.resources,
                  production: n.resources.production - cost,
                },
              };
            }
            return n;
          });
          break;
        }
      }
    }
  }

  return { provinces: currentProvinces, nations: currentNations };
}

// ---------------------------------------------------------------------------
// Wildcard / Special orders
// ---------------------------------------------------------------------------

function resolveWildcardOrders(
  allOrders: Record<string, Order[]>,
  nations: Nation[],
  provinces: Province[],
  armies: Army[],
  scenario: Scenario,
  turn: number
): { nations: Nation[]; provinces: Province[]; armies: Army[] } {
  let currentNations = [...nations];
  let currentProvinces = [...provinces];
  let currentArmies = [...armies];

  for (const nationId of Object.keys(allOrders)) {
    for (const order of allOrders[nationId]) {
      if (!isWildcardOrder(order)) continue;

      switch (order.type) {
        case 'spy': {
          const o = order as SpyOrder;
          currentNations = currentNations.map((n) => {
            if (n.id !== o.nationId) return n;
            const targetIntel = n.intelOf[o.targetNationId] ?? {
              military: 'Hidden' as const,
              economic: 'Hidden' as const,
              diplomatic: 'Hidden' as const,
              political: 'Hidden' as const,
            };
            return {
              ...n,
              intelOf: {
                ...n.intelOf,
                [o.targetNationId]: {
                  ...targetIntel,
                  [o.intelTrack]: 'Revealed' as const,
                },
              },
            };
          });
          break;
        }
        case 'restore_nation': {
          const o = order as RestoreNationOrder;
          const restorer = currentNations.find((n) => n.id === o.nationId);
          const target = currentNations.find((n) => n.id === o.targetNationId);

          if (
            restorer &&
            target &&
            target.eliminatedOnTurn !== undefined &&
            target.exileWindowExpires !== undefined &&
            turn <= target.exileWindowExpires &&
            restorer.resources.influence >= scenario.meta.exileRestoreCost
          ) {
            // Deduct influence
            currentNations = currentNations.map((n) => {
              if (n.id === o.nationId) {
                return {
                  ...n,
                  resources: {
                    ...n.resources,
                    influence: n.resources.influence - scenario.meta.exileRestoreCost,
                  },
                };
              }
              return n;
            });

            // Find a province to restore (original capital or first available)
            const capitalProvince = currentProvinces.find(
              (p) => p.strategicTag === 'Capital' && p.ownerId === 'rebel'
            );
            const restoreProvince = capitalProvince ?? currentProvinces.find(
              (p) => p.ownerId === 'rebel' || p.ownerId === null
            );

            if (restoreProvince) {
              // Restore province at dev 1, 50 unrest
              currentProvinces = currentProvinces.map((p) =>
                p.id === restoreProvince.id
                  ? { ...p, ownerId: o.targetNationId, devLevel: 1 as DevLevel, unrest: 50, focus: null }
                  : p
              );

              // Restore nation
              currentNations = currentNations.map((n) => {
                if (n.id === o.targetNationId) {
                  return {
                    ...n,
                    eliminatedOnTurn: undefined,
                    exileWindowExpires: undefined,
                    resources: { gold: 0, food: 0, production: 0, influence: 0, manpower: 0 },
                    relations: {
                      ...n.relations,
                      [o.nationId]: 60, // +60 toward restorer
                    },
                  };
                }
                return n;
              });
            }
          }
          break;
        }
        case 'hire_mercenaries': {
          const o = order as HireMercenariesOrder;
          currentNations = currentNations.map((n) => {
            if (n.id === o.nationId && n.resources.gold >= o.goldCost) {
              return {
                ...n,
                resources: {
                  ...n.resources,
                  gold: n.resources.gold - o.goldCost,
                  manpower: n.resources.manpower + o.manpowerGain,
                },
              };
            }
            return n;
          });
          break;
        }
      }
    }
  }

  return { nations: currentNations, provinces: currentProvinces, armies: currentArmies };
}

// ---------------------------------------------------------------------------
// Victory conditions (SPEC §15)
// ---------------------------------------------------------------------------

/**
 * Calculate a nation's tiebreaker score.
 * score = (sum of devLevel across owned provinces × 10) + gold stockpile + (active agreements count × 15)
 */
export function calculateNationScore(nation: Nation, provinces: Province[]): number {
  const ownedProvinces = provinces.filter((p) => p.ownerId === nation.id);
  const devScore = ownedProvinces.reduce((sum, p) => sum + p.devLevel * 10, 0);
  const goldScore = nation.resources.gold;
  const agreementCount = Object.values(nation.agreements)
    .flat()
    .filter((a) => a.active).length;
  const agreementScore = agreementCount * 15;

  return devScore + goldScore + agreementScore;
}

function checkVictoryConditions(state: GameState, scenario: Scenario): string | null {
  const { victoryConditions } = scenario.meta;
  const livingNations = state.nations.filter((n) => n.eliminatedOnTurn === undefined);

  // Check primary objective
  for (const nation of livingNations) {
    const obj = victoryConditions.primaryObjective;
    if (obj.type === 'control_regions') {
      const controlledRegions = obj.regions.filter((r) => {
        const province = state.provinces.find((p) => p.id === r);
        return province?.ownerId === nation.id;
      });
      if (controlledRegions.length === obj.regions.length) {
        // TODO: track turnsHeld across turns for full implementation
        return nation.id;
      }
    }
  }

  // Check domination threshold
  const totalProvinces = state.provinces.length;
  for (const nation of livingNations) {
    const ownedCount = state.provinces.filter((p) => p.ownerId === nation.id).length;
    if (totalProvinces > 0 && ownedCount / totalProvinces >= victoryConditions.dominationThreshold) {
      return nation.id;
    }
  }

  // Check turn limit
  if (state.turn >= victoryConditions.turnLimit) {
    let bestNation: string | null = null;
    let bestScore = -Infinity;
    for (const nation of livingNations) {
      const score = calculateNationScore(nation, state.provinces);
      if (score > bestScore) {
        bestScore = score;
        bestNation = nation.id;
      }
    }
    return bestNation;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main resolution entry point — WEGO turn resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a full turn. Pure function: takes current state + all orders, returns new state.
 * Follows phase order from SPEC §6.1:
 *   1. Order collection (already done — orders passed in)
 *   2. Diplomatic phase
 *   3. Military movement phase
 *   4. Combat phase
 *   5. Bookkeeping phase
 */
export function resolveOrders(
  state: GameState,
  allOrders: Record<string, Order[]>,
  eventLibrary: GameEvent[]
): GameState {
  const { scenario } = state;

  // Phase 2: Diplomatic resolution
  const diploResult = resolveDiplomaticPhase(
    allOrders,
    state.nations,
    state.wars,
    state.edges,
    state.provinces,
    state.turn,
    scenario
  );

  let currentState: GameState = {
    ...state,
    nations: diploResult.nations,
    wars: diploResult.wars,
    edges: diploResult.edges,
  };

  // Resolve construction orders (between diplo and military for resource deduction)
  const constructionResult = resolveConstruction(
    allOrders,
    currentState.provinces,
    currentState.nations,
    scenario
  );
  currentState = {
    ...currentState,
    provinces: constructionResult.provinces,
    nations: constructionResult.nations,
  };

  // Resolve wildcard orders
  const wildcardResult = resolveWildcardOrders(
    allOrders,
    currentState.nations,
    currentState.provinces,
    currentState.armies,
    scenario,
    currentState.turn
  );
  currentState = {
    ...currentState,
    nations: wildcardResult.nations,
    provinces: wildcardResult.provinces,
    armies: wildcardResult.armies,
  };

  // Phase 3: Military movement
  const movementResult = resolveMilitaryMovement(
    allOrders,
    currentState.armies,
    currentState.provinces,
    currentState.edges,
    currentState.wars
  );
  currentState = {
    ...currentState,
    armies: movementResult.armies,
    provinces: movementResult.provinces,
  };

  // Phase 4: Combat
  const combatResult = resolveCombatPhase(
    movementResult.pendingBattles,
    currentState.armies,
    currentState.provinces,
    scenario,
    currentState.turn
  );
  currentState = {
    ...currentState,
    armies: combatResult.armies,
    provinces: combatResult.provinces,
  };

  // Apply blockade edge deactivations
  for (const nationId of Object.keys(allOrders)) {
    for (const order of allOrders[nationId]) {
      if (order.type === 'blockade') {
        const blockade = order as BlockadeOrder;
        currentState = {
          ...currentState,
          edges: currentState.edges.map((e) => {
            if (
              (e.sourceId === blockade.edgeSourceId && e.targetId === blockade.edgeTargetId) ||
              (e.sourceId === blockade.edgeTargetId && e.targetId === blockade.edgeSourceId)
            ) {
              return { ...e, tradeActive: false };
            }
            return e;
          }),
        };
      }
    }
  }

  // Phase 5: Bookkeeping
  const bookkeepingResult = resolveBookkeeping(currentState, eventLibrary);

  // Build conflict report
  const allEntries: ConflictReportEntry[] = [
    ...diploResult.entries,
    ...movementResult.entries,
    ...combatResult.entries,
  ];

  const conflictReport: ConflictReport = {
    turn: state.turn,
    entries: allEntries,
  };

  // Build turn log
  const turnLog: TurnLog = {
    turn: state.turn,
    orders: allOrders,
    conflictReport,
    firedEvents: bookkeepingResult.firedEvents,
    eliminations: bookkeepingResult.eliminations,
  };

  return {
    ...currentState,
    turn: state.turn + 1,
    nations: bookkeepingResult.nations,
    provinces: bookkeepingResult.provinces,
    armies: bookkeepingResult.armies,
    wars: bookkeepingResult.wars,
    turnLogs: [...state.turnLogs, turnLog],
    eliminationLog: [...state.eliminationLog, ...bookkeepingResult.eliminations],
    winner: bookkeepingResult.winner,
    gameOver: bookkeepingResult.winner !== null,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function findNationPair(
  nations: Nation[],
  idA: string,
  idB: string
): [Nation | undefined, Nation | undefined] {
  return [nations.find((n) => n.id === idA), nations.find((n) => n.id === idB)];
}

function replaceNations(nations: Nation[], updates: Nation[]): Nation[] {
  const updateMap = new Map(updates.map((n) => [n.id, n]));
  return nations.map((n) => updateMap.get(n.id) ?? n);
}

function getArmyStrength(nationId: string, armies: Army[]): number {
  return armies
    .filter((a) => a.ownerId === nationId)
    .reduce((sum, a) => sum + a.strength, 0);
}

function findEliminator(nationId: string, wars: War[]): string {
  const war = wars.find((w) => w.defenderId === nationId);
  return war?.aggressorId ?? 'unknown';
}

function getActiveAgreementDescriptions(nation: Nation): string[] {
  const descriptions: string[] = [];
  for (const [partnerId, agreements] of Object.entries(nation.agreements)) {
    for (const a of agreements) {
      if (a.active) {
        descriptions.push(`${a.type} with ${partnerId}`);
      }
    }
  }
  return descriptions;
}

/**
 * Simple deterministic hash for combat seeding.
 */
function hashSeed(turn: number, provinceId: string): number {
  let hash = turn * 2654435761;
  for (let i = 0; i < provinceId.length; i++) {
    hash = ((hash << 5) - hash + provinceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
