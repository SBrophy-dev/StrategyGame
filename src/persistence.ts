/**
 * persistence.ts — The ONLY module that touches localStorage or triggers file I/O.
 * All other modules are storage-agnostic and receive/return serializable state.
 */

import type { GameState } from './types';

// --- Constants ---

const AUTOSAVE_KEY = 'pax_historia_autosave';
const SAVE_VERSION = 1;

// --- Save envelope (wraps GameState with metadata) ---

interface SaveEnvelope {
  version: number;
  savedAt: string;
  scenarioId: string;
  turn: number;
  state: GameState;
}

// --- Autosave (localStorage) ---

export function autosave(state: GameState): void {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    scenarioId: state.scenario.meta.id,
    turn: state.turn,
    state,
  };
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(envelope));
}

export function loadAutosave(): GameState | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (raw === null) return null;

  const envelope = parseAndValidateEnvelope(raw);
  return envelope.state;
}

export function hasAutosave(): boolean {
  return localStorage.getItem(AUTOSAVE_KEY) !== null;
}

export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// --- Manual save (JSON file download) ---

export function exportSave(state: GameState): void {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    scenarioId: state.scenario.meta.id,
    turn: state.turn,
    state,
  };

  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${state.scenario.meta.id}_turn${state.turn}.json`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// --- Manual load (JSON file upload) ---

export function importSave(file: File): Promise<GameState> {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith('.json')) {
      reject(new PersistenceError('File must be a .json file'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const raw = reader.result as string;
        const envelope = parseAndValidateEnvelope(raw);
        resolve(envelope.state);
      } catch (err) {
        reject(err instanceof PersistenceError ? err : new PersistenceError('Failed to read save file'));
      }
    };

    reader.onerror = () => {
      reject(new PersistenceError('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

// --- Validation ---

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function parseAndValidateEnvelope(raw: string): SaveEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PersistenceError('Save data is not valid JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PersistenceError('Save data must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== 'number') {
    throw new PersistenceError('Save data missing version field');
  }

  if (obj.version > SAVE_VERSION) {
    throw new PersistenceError(
      `Save version ${obj.version} is newer than supported version ${SAVE_VERSION}`
    );
  }

  if (typeof obj.savedAt !== 'string') {
    throw new PersistenceError('Save data missing savedAt field');
  }

  if (typeof obj.scenarioId !== 'string') {
    throw new PersistenceError('Save data missing scenarioId field');
  }

  if (typeof obj.turn !== 'number' || obj.turn < 0) {
    throw new PersistenceError('Save data has invalid turn number');
  }

  if (obj.state === null || typeof obj.state !== 'object' || Array.isArray(obj.state)) {
    throw new PersistenceError('Save data missing or invalid state object');
  }

  const state = obj.state as Record<string, unknown>;

  // Validate essential GameState shape
  if (typeof state.turn !== 'number') {
    throw new PersistenceError('GameState missing turn field');
  }
  if (!Array.isArray(state.provinces)) {
    throw new PersistenceError('GameState missing provinces array');
  }
  if (!Array.isArray(state.edges)) {
    throw new PersistenceError('GameState missing edges array');
  }
  if (!Array.isArray(state.nations)) {
    throw new PersistenceError('GameState missing nations array');
  }
  if (!Array.isArray(state.armies)) {
    throw new PersistenceError('GameState missing armies array');
  }
  if (!Array.isArray(state.wars)) {
    throw new PersistenceError('GameState missing wars array');
  }
  if (!Array.isArray(state.turnLogs)) {
    throw new PersistenceError('GameState missing turnLogs array');
  }
  if (!Array.isArray(state.eliminationLog)) {
    throw new PersistenceError('GameState missing eliminationLog array');
  }
  if (state.scenario === null || typeof state.scenario !== 'object') {
    throw new PersistenceError('GameState missing scenario object');
  }
  if (typeof state.gameOver !== 'boolean') {
    throw new PersistenceError('GameState missing gameOver field');
  }

  return obj as unknown as SaveEnvelope;
}
