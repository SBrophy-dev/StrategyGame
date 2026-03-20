import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  GameState,
  Nation,
  Province,
  Order,
  TurnLog,
  ConflictReportEntry,
} from '../types';
import { buildNotableReactionsSection } from './dialogText';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TurnSummaryModalProps {
  /** The fully-resolved GameState. The map has NOT yet updated to this state. */
  newState: GameState;
  playerNationId: string;
  /** Called when the player clicks Close or presses Escape on the last section.
   *  Parent calls commitTurn() here, which applies newState to the map. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Section shape
// ---------------------------------------------------------------------------

interface Section {
  title: string;
  entries: string[];
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function nationName(id: string, nations: Nation[]): string {
  return nations.find((n) => n.id === id)?.name ?? id;
}

function provinceName(id: string, provinces: Province[]): string {
  return provinces.find((p) => p.id === id)?.name ?? id;
}

/**
 * Two-pass ID substitution in a text string.
 *
 * Pass 1: Replace mustache-style template tokens ({nation.name}, {province.name}, etc.)
 *   If a resolved nation name is supplied, {nation.*} tokens are replaced with that name;
 *   otherwise they fall back to a generic [nation] label.
 *   {province.*} tokens always fall back to [province] since province context isn't stored.
 *
 * Pass 2: Replace bare nation/province IDs (e.g. "n01", "p04") with display names.
 *   Longer IDs are substituted first to avoid prefix-collision (e.g. "n1" vs "n10").
 *   Substitution is skipped for a given entity if its display name is already
 *   present in the string, preventing double-processing of already-resolved text.
 */
function resolveIdsInText(
  text: string,
  nations: Nation[],
  provinces: Province[],
  resolvedNationName?: string
): string {
  let result = text;

  // Pass 1 — mustache tokens
  result = result.replace(/\{[^}]+\}/g, (match) => {
    if (match.toLowerCase().includes('nation')) {
      return resolvedNationName ?? '[nation]';
    }
    if (match.toLowerCase().includes('province')) return '[province]';
    return '[...]';
  });

  // Pass 2 — bare nation IDs → names (longest first to avoid prefix collisions)
  const sortedNations = [...nations].sort((a, b) => b.id.length - a.id.length);
  for (const nation of sortedNations) {
    if (result.includes(nation.id) && !result.includes(nation.name)) {
      result = result.split(nation.id).join(nation.name);
    }
  }

  // Pass 3 — bare province IDs → names (longest first)
  const sortedProvinces = [...provinces].sort((a, b) => b.id.length - a.id.length);
  for (const province of sortedProvinces) {
    if (result.includes(province.id) && !result.includes(province.name)) {
      result = result.split(province.id).join(province.name);
    }
  }

  return result;
}

/** "war_exhaustion" → "War Exhaustion" */
function formatEventId(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Combine a ConflictReportEntry's description + resolution into one readable line. */
function formatConflictEntry(
  entry: ConflictReportEntry,
  nations: Nation[],
  provinces: Province[]
): string {
  const desc = resolveIdsInText(entry.description, nations, provinces, undefined);
  const res = resolveIdsInText(entry.resolution, nations, provinces, undefined);
  return `${desc} \u2014 ${res}`;
}

/** Human-readable one-line label for any Order, with full name resolution. */
function formatOrderLine(order: Order, nations: Nation[], provinces: Province[]): string {
  const nn = (id: string) => nationName(id, nations);
  const pn = (id: string) => provinceName(id, provinces);

  switch (order.type) {
    case 'propose_agreement':
      return `Propose ${order.agreementType} with ${nn(order.targetNationId)}`;
    case 'break_agreement':
      return `Break ${order.agreementType} with ${nn(order.targetNationId)}`;
    case 'declare_war':
      return `Declare war on ${nn(order.targetNationId)}`;
    case 'offer_peace':
      return `Offer peace to ${nn(order.targetNationId)}`;
    case 'move_army':
      return `Move army: ${pn(order.fromProvinceId)} \u2192 ${pn(order.toProvinceId)}`;
    case 'retreat':
      return `Retreat to ${pn(order.toProvinceId)}`;
    case 'blockade':
      return `Blockade ${pn(order.edgeSourceId)}\u2013${pn(order.edgeTargetId)}`;
    case 'upgrade_dev':
      return `Upgrade development: ${pn(order.provinceId)}`;
    case 'set_focus':
      return `Set focus ${order.focus}: ${pn(order.provinceId)}`;
    case 'build_fort':
      return `Build fort: ${pn(order.provinceId)}`;
    case 'spy':
      return `Spy on ${nn(order.targetNationId)} (${order.intelTrack} intel)`;
    case 'restore_nation':
      return `Restore ${nn(order.targetNationId)}`;
    case 'hire_mercenaries':
      return `Hire mercenaries (${order.goldCost} gold \u2192 +${order.manpowerGain} manpower)`;
  }
}

/** Priority order for choosing the "primary" action to display in AI summary. */
const ACTION_PRIORITY: Order['type'][] = [
  'declare_war',
  'move_army',
  'propose_agreement',
  'break_agreement',
  'offer_peace',
  'blockade',
  'build_fort',
  'upgrade_dev',
  'set_focus',
  'spy',
  'restore_nation',
  'hire_mercenaries',
  'retreat',
];

function primaryAiAction(orders: Order[], nations: Nation[], provinces: Province[]): string {
  if (orders.length === 0) return 'No significant actions';
  const sorted = [...orders].sort((a, b) => {
    const ai = ACTION_PRIORITY.indexOf(a.type);
    const bi = ACTION_PRIORITY.indexOf(b.type);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return formatOrderLine(sorted[0], nations, provinces);
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildPlayerActionsSection(
  turnLog: TurnLog,
  playerNationId: string,
  nations: Nation[],
  provinces: Province[]
): Section {
  const entries: string[] = [];
  const playerOrders = turnLog.orders[playerNationId] ?? [];

  for (const order of playerOrders) {
    entries.push('\u2192 ' + formatOrderLine(order, nations, provinces));
  }

  const playerConflicts = turnLog.conflictReport.entries.filter((e) =>
    e.involvedNations.includes(playerNationId)
  );
  for (const entry of playerConflicts) {
    entries.push('\u2022 ' + formatConflictEntry(entry, nations, provinces));
  }

  return { title: 'Your Actions', entries };
}

function buildDiplomaticSection(
  turnLog: TurnLog,
  nations: Nation[],
  provinces: Province[]
): Section {
  const diploOrderTypes = new Set([
    'propose_agreement',
    'break_agreement',
    'declare_war',
    'offer_peace',
  ]);
  const diploConflictTypes = new Set([
    'peace_over_war',
    'agreement_priority',
    'alliance_proposal_tiebreak',
  ]);
  const entries: string[] = [];

  for (const [nationId, orders] of Object.entries(turnLog.orders)) {
    for (const order of orders) {
      if (diploOrderTypes.has(order.type)) {
        entries.push(
          `${nationName(nationId, nations)}: ${formatOrderLine(order, nations, provinces)}`
        );
      }
    }
  }

  for (const entry of turnLog.conflictReport.entries) {
    if (diploConflictTypes.has(entry.type)) {
      entries.push('\u2022 ' + formatConflictEntry(entry, nations, provinces));
    }
  }

  return { title: 'Diplomatic Events', entries };
}

function buildMilitarySection(
  turnLog: TurnLog,
  nations: Nation[],
  provinces: Province[]
): Section {
  const militaryTypes = new Set([
    'battle',
    'defender_swap',
    'simultaneous_entry',
    'blockade_over_trade',
  ]);
  const entries: string[] = [];

  for (const entry of turnLog.conflictReport.entries) {
    if (militaryTypes.has(entry.type)) {
      entries.push('\u2022 ' + formatConflictEntry(entry, nations, provinces));
    }
  }

  return { title: 'Military Events', entries };
}

function buildConstructionSection(
  turnLog: TurnLog,
  nations: Nation[],
  provinces: Province[]
): Section {
  const constructionTypes = new Set([
    'upgrade_dev',
    'set_focus',
    'build_fort',
    'hire_mercenaries',
  ]);
  const entries: string[] = [];

  for (const [nationId, orders] of Object.entries(turnLog.orders)) {
    for (const order of orders) {
      if (constructionTypes.has(order.type)) {
        entries.push(
          `${nationName(nationId, nations)}: ${formatOrderLine(order, nations, provinces)}`
        );
      }
    }
  }

  return { title: 'Construction & Development', entries };
}

function buildEventsSection(
  turnLog: TurnLog,
  nations: Nation[],
  provinces: Province[]
): Section {
  const entries: string[] = [];

  for (const firedEvent of turnLog.firedEvents) {
    const label = formatEventId(firedEvent.event.id);
    const triggeringNationName = nationName(firedEvent.nationId, nations);
    const narrative = resolveIdsInText(
      firedEvent.event.narrative,
      nations,
      provinces,
      triggeringNationName
    );
    entries.push(`${label} (${triggeringNationName}): ${narrative}`);
  }

  return { title: 'World Events', entries };
}

function buildAiSummarySection(
  turnLog: TurnLog,
  playerNationId: string,
  newState: GameState
): Section {
  const { nations, provinces } = newState;
  const entries: string[] = [];

  const livingAiNations = nations.filter(
    (n) => n.id !== playerNationId && n.eliminatedOnTurn === undefined
  );

  for (const nation of livingAiNations) {
    const orders = turnLog.orders[nation.id] ?? [];
    const primary = primaryAiAction(orders, nations, provinces);
    entries.push(`${nation.name}: ${primary}`);
  }

  return { title: 'AI Nations', entries };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TurnSummaryModal({
  newState,
  playerNationId,
  onClose,
}: TurnSummaryModalProps) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [bodyVisible, setBodyVisible] = useState(true);

  const turnLog = newState.turnLogs[newState.turnLogs.length - 1];
  const { nations, provinces } = newState;
  // turnLog.turn is the just-resolved turn number (before the +1 increment in newState.turn)
  const displayTurn = turnLog?.turn ?? newState.turn - 1;

  const sections = useMemo((): Section[] => {
    if (!turnLog) return [];

    const raw: Section[] = [
      buildNotableReactionsSection(turnLog, newState, playerNationId),
      buildPlayerActionsSection(turnLog, playerNationId, nations, provinces),
      buildDiplomaticSection(turnLog, nations, provinces),
      buildMilitarySection(turnLog, nations, provinces),
      buildConstructionSection(turnLog, nations, provinces),
      buildEventsSection(turnLog, nations, provinces),
      buildAiSummarySection(turnLog, playerNationId, newState),
    ];

    return raw.filter((s) => s.entries.length > 0);
  }, [turnLog, playerNationId, nations, provinces, newState]);

  /** Animate body out, switch section, animate back in. */
  const navigateTo = useCallback((targetIndex: number) => {
    setBodyVisible(false);
    setTimeout(() => {
      setSectionIndex(targetIndex);
      setBodyVisible(true);
    }, 150);
  }, []);

  // Escape → jump to final section (player must still click Close to commit)
  useEffect(() => {
    const lastIdx = Math.max(0, sections.length - 1);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigateTo(lastIdx);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sections.length, navigateTo]);

  // Edge case: no sections (completely quiet turn)
  if (!turnLog || sections.length === 0) {
    return (
      <div className="turn-modal-backdrop">
        <div className="turn-modal">
          <div className="turn-modal__header">
            <span className="turn-modal__turn-label">Turn {displayTurn} Summary</span>
            <span className="turn-modal__section-title">Nothing of note</span>
          </div>
          <div className="turn-modal__body turn-modal__body--visible">
            <p className="turn-modal__empty">No notable events occurred this turn.</p>
          </div>
          <div className="turn-modal__footer">
            <span className="turn-modal__progress-dots" />
            <button className="turn-modal__btn turn-modal__btn--primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = sections[sectionIndex];
  const isLast = sectionIndex === sections.length - 1;

  return (
    <div className="turn-modal-backdrop">
      <div className="turn-modal">
        <div className="turn-modal__header">
          <span className="turn-modal__turn-label">Turn {displayTurn} Summary</span>
          <span className="turn-modal__section-title">{current.title}</span>
        </div>

        <div
          className={`turn-modal__body${bodyVisible ? ' turn-modal__body--visible' : ''}`}
        >
          <ul className="turn-modal__entries">
            {current.entries.map((entry, i) => (
              <li
                key={i}
                className="turn-modal__entry"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                {entry}
              </li>
            ))}
          </ul>
        </div>

        <div className="turn-modal__footer">
          <span className="turn-modal__progress-dots">
            {sections.map((_, i) => (
              <span
                key={i}
                className={`turn-modal__dot${i === sectionIndex ? ' turn-modal__dot--active' : ''}`}
              />
            ))}
          </span>

          {isLast ? (
            <button className="turn-modal__btn turn-modal__btn--primary" onClick={onClose}>
              Close
            </button>
          ) : (
            <button
              className="turn-modal__btn"
              onClick={() => navigateTo(sectionIndex + 1)}
            >
              Next &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
