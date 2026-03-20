/**
 * dialogText.ts — Pure helper module for action log / dialog feedback.
 *
 * Two exports:
 *   queuedOrderFeedback   — pre-resolution, used by RightPanel on button click
 *   buildNotableReactionsSection — post-resolution, used by TurnSummaryModal
 *
 * No React imports. No engine imports. All derivations come from existing
 * Order / ConflictReport / GameState data — no new GameState fields.
 */

import type { Order, Nation, Province, TurnLog, GameState } from '../types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const AGREEMENT_LABELS: Record<string, string> = {
  NonAggressionPact: 'Non-Aggression Pact',
  TradeDeal: 'Trade Deal',
  MilitaryAlliance: 'Military Alliance',
  Vassalage: 'Vassalage',
};

function nn(id: string, nations: Nation[]): string {
  return nations.find((n) => n.id === id)?.name ?? id;
}

function pn(id: string, provinces: Province[]): string {
  return provinces.find((p) => p.id === id)?.name ?? id;
}

/**
 * Substitute bare nation/province IDs in an engine-generated text string
 * so it can be shown to the player without raw ID tokens.
 * Longer IDs first to avoid prefix-collision (e.g. "n1" vs "n10").
 */
function resolveIds(text: string, nations: Nation[], provinces: Province[]): string {
  let result = text;

  const sortedNations = [...nations].sort((a, b) => b.id.length - a.id.length);
  for (const nation of sortedNations) {
    if (result.includes(nation.id) && !result.includes(nation.name)) {
      result = result.split(nation.id).join(nation.name);
    }
  }

  const sortedProvinces = [...provinces].sort((a, b) => b.id.length - a.id.length);
  for (const province of sortedProvinces) {
    if (result.includes(province.id) && !result.includes(province.name)) {
      result = result.split(province.id).join(province.name);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Export 1: pre-resolution feedback (used by RightPanel)
// ---------------------------------------------------------------------------

/**
 * Return a short, outcome-neutral confirmation string for an order that has
 * just been queued. All messages describe the act of issuing/queuing only —
 * no outcome is implied, since resolution has not happened yet.
 *
 * @param order    The order that was just queued.
 * @param nations  Nations array for name lookup (existing RightPanel prop).
 * @param provinces Province array for name lookup (scenario.world.provinces).
 */
export function queuedOrderFeedback(
  order: Order,
  nations: Nation[],
  provinces: Province[]
): string {
  switch (order.type) {
    case 'propose_agreement':
      return `${AGREEMENT_LABELS[order.agreementType] ?? order.agreementType} proposed to ${nn(order.targetNationId, nations)}.`;

    case 'break_agreement':
      return `Order to break ${AGREEMENT_LABELS[order.agreementType] ?? order.agreementType} with ${nn(order.targetNationId, nations)} queued.`;

    case 'declare_war':
      return `War declaration against ${nn(order.targetNationId, nations)} queued.`;

    case 'offer_peace':
      return `Peace offer to ${nn(order.targetNationId, nations)} queued.`;

    case 'upgrade_dev':
      return `Development upgrade for ${pn(order.provinceId, provinces)} queued.`;

    case 'build_fort':
      return `Fort construction at ${pn(order.provinceId, provinces)} queued.`;

    case 'set_focus':
      return `${pn(order.provinceId, provinces)}: focus will shift to ${order.focus} next turn.`;

    case 'move_army':
      return `Army ordered toward ${pn(order.toProvinceId, provinces)}.`;

    case 'blockade':
      return `Naval blockade order queued.`;

    case 'retreat':
      return `Retreat to ${pn(order.toProvinceId, provinces)} ordered.`;

    case 'spy':
      return `Espionage order queued: ${nn(order.targetNationId, nations)}, military track.`;

    case 'restore_nation':
      return `Restoration order queued for ${nn(order.targetNationId, nations)}.`;

    case 'hire_mercenaries':
      return `Mercenary contract queued.`;
  }
}

// ---------------------------------------------------------------------------
// Export 2: post-resolution section (used by TurnSummaryModal)
// ---------------------------------------------------------------------------

/**
 * Build the "Notable Reactions" section from resolved turn data.
 * Returns `{ title, entries }` — structurally compatible with the local
 * Section type in TurnSummaryModal.
 * An empty `entries` array causes TurnSummaryModal's existing filter to omit
 * the section on quiet turns.
 *
 * Derives entries from:
 *   A. Player diplomatic order outcomes (checked against newState)
 *   B. Battle outcomes involving the player (checked against province.ownerId)
 *   C. Structural CONFLICT_PRIORITY resolutions involving the player
 */
export function buildNotableReactionsSection(
  turnLog: TurnLog,
  newState: GameState,
  playerNationId: string
): { title: string; entries: string[] } {
  const { nations, provinces, wars } = newState;
  const entries: string[] = [];
  const playerOrders = turnLog.orders[playerNationId] ?? [];

  // A. Diplomatic outcomes ---------------------------------------------------

  for (const order of playerOrders) {
    if (order.type === 'propose_agreement') {
      const targetName = nn(order.targetNationId, nations);
      const label = AGREEMENT_LABELS[order.agreementType] ?? order.agreementType;

      // An agreement created this turn will have startedOnTurn === turnLog.turn
      const targetNation = nations.find((n) => n.id === order.targetNationId);
      const agreed =
        targetNation?.agreements[playerNationId]?.some(
          (a) => a.type === order.agreementType && a.active && a.startedOnTurn === turnLog.turn
        ) ?? false;

      if (agreed) {
        entries.push(`${targetName} accepts your ${label}.`);
      } else {
        entries.push(`Your ${label} proposal to ${targetName} awaits a reply.`);
      }
    } else if (order.type === 'break_agreement') {
      const targetName = nn(order.targetNationId, nations);
      const label = AGREEMENT_LABELS[order.agreementType] ?? order.agreementType;
      entries.push(
        `Relations with ${targetName} deteriorated after you broke the ${label}.`
      );
    } else if (order.type === 'declare_war') {
      const targetName = nn(order.targetNationId, nations);
      const warStarted = wars.some(
        (w) =>
          (w.aggressorId === playerNationId && w.defenderId === order.targetNationId) ||
          (w.aggressorId === order.targetNationId && w.defenderId === playerNationId)
      );
      if (warStarted) {
        entries.push(`War with ${targetName} has begun.`);
      } else {
        entries.push(`War declaration against ${targetName} was superseded by another order.`);
      }
    } else if (order.type === 'offer_peace') {
      const targetName = nn(order.targetNationId, nations);
      const warStillActive = wars.some(
        (w) =>
          (w.aggressorId === playerNationId && w.defenderId === order.targetNationId) ||
          (w.aggressorId === order.targetNationId && w.defenderId === playerNationId)
      );
      if (!warStillActive) {
        entries.push(`Peace has been established with ${targetName}.`);
      } else {
        entries.push(`${targetName} has not accepted your peace offer.`);
      }
    }
  }

  // B. Battle outcomes -------------------------------------------------------

  for (const entry of turnLog.conflictReport.entries) {
    if (entry.type !== 'battle') continue;
    if (!entry.involvedNations.includes(playerNationId)) continue;

    const enemyId = entry.involvedNations.find((id) => id !== playerNationId);
    const enemyName = enemyId ? nn(enemyId, nations) : 'the enemy';

    if (entry.provinceId) {
      const province = provinces.find((p) => p.id === entry.provinceId);
      const provinceName = province?.name ?? entry.provinceId;
      const playerWon = province?.ownerId === playerNationId;

      if (playerWon) {
        entries.push(`Your forces seize ${provinceName} after battle with ${enemyName}.`);
      } else {
        entries.push(`Your army is repelled at ${provinceName} by ${enemyName}.`);
      }
    } else {
      // No province context — fall back to engine description + resolution text
      const text = resolveIds(
        `${entry.description} \u2014 ${entry.resolution}`,
        nations,
        provinces
      );
      entries.push(text);
    }
  }

  // C. Structural CONFLICT_PRIORITY resolutions involving the player ----------

  for (const entry of turnLog.conflictReport.entries) {
    if (!entry.involvedNations.includes(playerNationId)) continue;

    if (entry.type === 'peace_over_war') {
      const otherId = entry.involvedNations.find((id) => id !== playerNationId);
      const otherName = otherId ? nn(otherId, nations) : 'another nation';
      entries.push(`A simultaneous peace offer resolved the conflict with ${otherName}.`);
    } else if (
      entry.type === 'alliance_proposal_tiebreak' ||
      entry.type === 'simultaneous_war_declaration'
    ) {
      entries.push(resolveIds(entry.resolution, nations, provinces));
    }
  }

  return { title: 'Notable Reactions', entries };
}
