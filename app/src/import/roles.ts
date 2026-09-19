import type { Position } from '../data/types';

/** Normalized role token -> canonical Position. */
const ROLE_ALIASES: Record<string, Position> = {
  top: 'top',
  toplane: 'top',
  jungle: 'jungle',
  jgl: 'jungle',
  jng: 'jungle',
  jg: 'jungle',
  mid: 'mid',
  midlane: 'mid',
  middle: 'mid',
  bot: 'bot',
  bottom: 'bot',
  adc: 'bot',
  adcarry: 'bot',
  marksman: 'bot',
  support: 'support',
  supp: 'support',
  sup: 'support',
  utility: 'support',
};

/**
 * Map a free-text role label to a canonical {@link Position}, or `undefined`
 * when it is not recognized. Case-, space- and punctuation-insensitive
 * (`"Top Lane"` -> top, `"AD Carry"` -> bot).
 */
export function normalizeRole(input: string): Position | undefined {
  const key = input.toLowerCase().replace(/[^a-z]/g, '');
  return ROLE_ALIASES[key];
}
