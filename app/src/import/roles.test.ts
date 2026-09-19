import { describe, expect, it } from 'vitest';
import { normalizeRole } from './roles';

describe('normalizeRole', () => {
  it('maps top variants', () => {
    for (const s of ['top', 'Top', 'toplane', 'Top Lane', 'TOP']) {
      expect(normalizeRole(s)).toBe('top');
    }
  });

  it('maps jungle variants', () => {
    for (const s of ['jungle', 'jgl', 'jng', 'jg', 'JUNGLE']) {
      expect(normalizeRole(s)).toBe('jungle');
    }
  });

  it('maps mid variants', () => {
    for (const s of ['mid', 'midlane', 'middle', 'MIDDLE']) {
      expect(normalizeRole(s)).toBe('mid');
    }
  });

  it('maps bot variants', () => {
    for (const s of ['bot', 'bottom', 'adc', 'AD Carry', 'marksman', 'BOTTOM']) {
      expect(normalizeRole(s)).toBe('bot');
    }
  });

  it('maps support variants', () => {
    for (const s of ['support', 'supp', 'sup', 'utility', 'UTILITY']) {
      expect(normalizeRole(s)).toBe('support');
    }
  });

  it('returns undefined for unknown roles', () => {
    expect(normalizeRole('carry')).toBeUndefined();
    expect(normalizeRole('')).toBeUndefined();
  });
});
