import type { SetupState } from './reducer';

const KEY = 'loldrafttool.setup.v1';

/**
 * Loads the persisted setup (format, side, imported pool and opponents,
 * fearless list) from localStorage. Returns null when absent or unreadable —
 * the caller falls back to defaults.
 */
export function loadSetup(): SetupState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SetupState;
  } catch {
    return null;
  }
}

/** Persists the setup to localStorage. Failures are ignored (e.g. private mode). */
export function saveSetup(setup: SetupState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }
}
