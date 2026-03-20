/**
 * eventLibrary.ts — Loads generic event JSON files by ID.
 * Events are statically imported so Vite can bundle them.
 * This module has no side effects — it returns data only.
 */

import type { GameEvent } from './types';

// Static imports of all generic event JSON files
import rebellion from './events/rebellion.json';
import warExhaustion from './events/war_exhaustion.json';
import assassinationAttempt from './events/assassination_attempt.json';
import economicCollapseWarning from './events/economic_collapse_warning.json';
import breakthrough from './events/breakthrough.json';
import naturalDisaster from './events/natural_disaster.json';
import successionCrisis from './events/succession_crisis.json';
import plague from './events/plague.json';
import mercenaryOffer from './events/mercenary_offer.json';

// Master lookup of all generic events by ID
const EVENT_REGISTRY: Record<string, GameEvent> = {
  rebellion: rebellion as unknown as GameEvent,
  war_exhaustion: warExhaustion as unknown as GameEvent,
  assassination_attempt: assassinationAttempt as unknown as GameEvent,
  economic_collapse_warning: economicCollapseWarning as unknown as GameEvent,
  breakthrough: breakthrough as unknown as GameEvent,
  natural_disaster: naturalDisaster as unknown as GameEvent,
  succession_crisis: successionCrisis as unknown as GameEvent,
  plague: plague as unknown as GameEvent,
  mercenary_offer: mercenaryOffer as unknown as GameEvent,
};

/**
 * Load generic events referenced by a scenario's genericEvents ID list.
 * Also includes the scenario's scriptedEvents.
 * Returns the full event library array to pass to resolveOrders().
 */
export function loadEventLibrary(
  genericEventIds: string[],
  scriptedEvents: GameEvent[]
): GameEvent[] {
  const events: GameEvent[] = [];

  for (const id of genericEventIds) {
    const event = EVENT_REGISTRY[id];
    if (event) {
      events.push(event);
    }
  }

  // Scripted events are also part of the library — they get evaluated each turn
  for (const scripted of scriptedEvents) {
    events.push(scripted);
  }

  return events;
}
