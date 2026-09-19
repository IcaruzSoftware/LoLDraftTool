import { describe, expect, it } from 'vitest';
import { createNameResolver, normalizeName } from './names';
import { loadChampions } from './fixtures';
import type { ResolveResult } from './types';

const resolver = createNameResolver(loadChampions());

function id(input: string): number {
  const r: ResolveResult = resolver.resolve(input);
  if ('error' in r) throw new Error(`expected resolution for "${input}": ${r.error}`);
  return r.id;
}

describe('normalizeName', () => {
  it('strips punctuation and case', () => {
    expect(normalizeName("Kai'Sa")).toBe('kaisa');
    expect(normalizeName('Nunu & Willump')).toBe('nunuwillump');
    expect(normalizeName('Dr. Mundo')).toBe('drmundo');
    expect(normalizeName('Renata Glasc')).toBe('renataglasc');
  });
});

describe('createNameResolver', () => {
  it('resolves exact display names', () => {
    expect(id('Aatrox')).toBe(266);
    expect(id('Ahri')).toBe(103);
  });

  it('resolves punctuation and spacing variants', () => {
    expect(id("Kai'Sa")).toBe(id('Kaisa'));
    expect(id('Dr. Mundo')).toBe(id('drmundo'));
    expect(id('Nunu & Willump')).toBe(id('nunuwillump'));
    expect(id('Renata Glasc')).toBe(id('renata'));
  });

  it('resolves aliases in both directions (MonkeyKing <-> Wukong)', () => {
    expect(id('MonkeyKing')).toBe(62);
    expect(id('Wukong')).toBe(62);
    expect(id('monkeyking')).toBe(id('wukong'));
  });

  it('resolves the nickname table', () => {
    expect(id('mf')).toBe(id('Miss Fortune'));
    expect(id('tf')).toBe(id('Twisted Fate'));
    expect(id('j4')).toBe(id('Jarvan IV'));
    expect(id('asol')).toBe(id('Aurelion Sol'));
    expect(id('kog')).toBe(id("Kog'Maw"));
    expect(id('nunu')).toBe(id('Nunu & Willump'));
    expect(id('lee')).toBe(id('Lee Sin'));
  });

  it('resolves a unique prefix', () => {
    expect(id('Aatr')).toBe(266);
  });

  it('errors with suggestions on an ambiguous prefix', () => {
    const r = resolver.resolve('ka');
    expect('error' in r).toBe(true);
  });

  it('errors with close suggestions on a typo', () => {
    const r = resolver.resolve('Aatrx');
    if (!('error' in r)) throw new Error('expected error');
    expect(r.suggestions).toContain('Aatrox');
    expect(r.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('errors on empty input', () => {
    const r = resolver.resolve('   ');
    expect('error' in r).toBe(true);
  });

  it('nameOf returns the display name', () => {
    expect(resolver.nameOf(266)).toBe('Aatrox');
    expect(resolver.nameOf(-1)).toBeUndefined();
  });
});
