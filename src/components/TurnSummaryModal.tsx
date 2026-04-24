import { useState } from 'react';
import type { GameState, Order } from '../types';
import GameIcon from './GameIcon';
import { buildNotableReactionsSection } from './dialogText';

export interface TurnSummaryModalProps {
  newState: GameState;
  playerNationId: string;
  onClose: () => void;
}

interface Section {
  title: string;
  icon: import('./GameIcon').GameIconName;
  entries: string[];
}

function nn(id: string, nations: GameState['nations']): string {
  return nations.find((n) => n.id === id)?.name ?? id;
}

function pn(id: string, provinces: GameState['provinces']): string {
  return provinces.find((p) => p.id === id)?.name ?? id;
}

function describeOrder(
  order: Order,
  nations: GameState['nations'],
  provinces: GameState['provinces']
): string {
  switch (order.type) {
    case 'move_army':
      return `Army moved to ${pn(order.toProvinceId, provinces)}.`;
    case 'upgrade_dev':
      return `${pn(order.provinceId, provinces)} development upgraded.`;
    case 'build_fort':
      return `Fort built at ${pn(order.provinceId, provinces)}.`;
    case 'set_focus':
      return `${pn(order.provinceId, provinces)} focus set to ${order.focus}.`;
    case 'declare_war':
      return `War declared on ${nn(order.targetNationId, nations)}.`;
    case 'offer_peace':
      return `Peace offered to ${nn(order.targetNationId, nations)}.`;
    case 'propose_agreement':
      return `Agreement proposed to ${nn(order.targetNationId, nations)}.`;
    case 'break_agreement':
      return `Agreement broken with ${nn(order.targetNationId, nations)}.`;
    case 'blockade':
      return `Naval blockade ordered.`;
    case 'retreat':
      return `Army retreated to ${pn(order.toProvinceId, provinces)}.`;
    case 'spy':
      return `Espionage conducted against ${nn(order.targetNationId, nations)}.`;
    case 'restore_nation':
      return `Nation restored: ${nn(order.targetNationId, nations)}.`;
    case 'hire_mercenaries':
      return `Mercenaries hired.`;
  }
}

function buildSections(state: GameState, playerNationId: string): Section[] {
  const { turnLogs, nations, provinces, wars } = state;
  const lastLog = turnLogs.length > 0 ? turnLogs[turnLogs.length - 1] : null;
  const sections: Section[] = [];

  // 1) Player Actions
  if (lastLog) {
    const playerOrders = lastLog.orders[playerNationId] ?? [];
    const entries = playerOrders.map((o) => describeOrder(o, nations, provinces));
    if (entries.length > 0) {
      sections.push({ title: 'Your Orders', icon: 'activity', entries });
    }
  }

  // 2) Notable Reactions (diplomacy, battles, conflict resolutions)
  if (lastLog) {
    const notable = buildNotableReactionsSection(lastLog, state, playerNationId);
    if (notable.entries.length > 0) {
      sections.push({ title: notable.title, icon: 'suggestions', entries: notable.entries });
    }
  }

  // 3) Fired Events
  if (lastLog) {
    const eventEntries = lastLog.firedEvents
      .filter((fe) => fe.nationId === playerNationId)
      .map((fe) => {
        const text = fe.event.narrative;
        const player = nations.find((n) => n.id === playerNationId);
        return text.replace(/\{nation\.name\}/g, player?.name ?? 'Your nation');
      });
    if (eventEntries.length > 0) {
      sections.push({ title: 'Events', icon: 'zap', entries: eventEntries });
    }
  }

  // 4) Eliminations
  if (lastLog && lastLog.eliminations.length > 0) {
    const entries = lastLog.eliminations.map((e) => {
      const eliminated = nn(e.nationId, nations);
      const eliminator = nn(e.eliminatorId, nations);
      return `${eliminated} has been eliminated by ${eliminator}.`;
    });
    sections.push({ title: 'Eliminations', icon: 'warning', entries });
  }

  // 5) Wars overview
  if (wars.length > 0) {
    const entries = wars.map((w) => {
      const aggressor = nn(w.aggressorId, nations);
      const defender = nn(w.defenderId, nations);
      return `${aggressor} vs ${defender} (since turn ${w.startedOnTurn})`;
    });
    sections.push({ title: 'Active Wars', icon: 'swords', entries });
  }

  // 6) Fallback if nothing happened
  if (sections.length === 0) {
    sections.push({
      title: 'Turn Summary',
      icon: 'activity',
      entries: ['No major events this turn.'],
    });
  }

  return sections;
}

export default function TurnSummaryModal({
  newState,
  playerNationId,
  onClose,
}: TurnSummaryModalProps) {
  const [sectionIndex, setSectionIndex] = useState(0);

  const sections = buildSections(newState, playerNationId);
  const current = sections[Math.min(sectionIndex, sections.length - 1)];

  const nextSection = () => {
    setSectionIndex((prev) => Math.min(prev + 1, sections.length - 1));
  };

  const prevSection = () => {
    setSectionIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="turn-modal-backdrop">
      <div className="turn-modal">
        <div className="turn-modal__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <GameIcon name={current.icon} size={24} />
            <span className="turn-modal__section-title">{current.title}</span>
          </div>
          <span className="turn-modal__turn-label">Turn {newState.turn}</span>
        </div>

        <div className="turn-modal__body turn-modal__body--visible">
          <ul className="turn-modal__entries">
            {current.entries.map((entry: string, i: number) => (
              <li key={i} className="turn-modal__entry">
                <span className="turn-modal__entry-icon">
                  <GameIcon name="hints" size={14} />
                </span>
                <span className="turn-modal__entry-text">{entry}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="turn-modal__footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {sectionIndex > 0 && (
              <button className="turn-modal__btn" onClick={prevSection}>
                ‹ Previous
              </button>
            )}
            <span
              className="turn-modal__progress"
              style={{ fontSize: '13px', color: 'var(--text-muted)' }}
            >
              {sectionIndex + 1} of {sections.length}
            </span>
            {sectionIndex < sections.length - 1 && (
              <button className="turn-modal__btn" onClick={nextSection}>
                Next ›
              </button>
            )}
          </div>
          {sectionIndex === sections.length - 1 && (
            <button
              className="turn-modal__btn turn-modal__btn--primary"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
