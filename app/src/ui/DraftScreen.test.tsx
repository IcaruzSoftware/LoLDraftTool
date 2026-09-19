import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

const FIXTURE = [
  { id: 266, alias: 'Aatrox', name: 'Aatrox', positions: { top: 1 }, damageType: 'AD' },
  { id: 103, alias: 'Ahri', name: 'Ahri', positions: { mid: 1 }, damageType: 'AP' },
  { id: 64, alias: 'LeeSin', name: 'Lee Sin', positions: { jungle: 1 }, damageType: 'AD' },
  { id: 222, alias: 'Jinx', name: 'Jinx', positions: { bot: 1 }, damageType: 'AD' },
  { id: 111, alias: 'Nautilus', name: 'Nautilus', positions: { support: 1 }, damageType: 'AP' },
  { id: 84, alias: 'Akali', name: 'Akali', positions: { mid: 1, top: 0.8 }, damageType: 'AP' },
];

beforeEach(() => {
  localStorage.clear();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/data/champions.json')) {
      return Promise.resolve({ ok: true, json: async () => FIXTURE } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startDraft(): Promise<HTMLElement> {
  const { container } = render(<App />);
  const demo = await screen.findByRole('button', { name: 'Use demo pool' });
  fireEvent.click(demo);
  fireEvent.click(screen.getByRole('button', { name: 'Start Draft' }));
  await screen.findByText(/BAN PHASE 1/i);
  return container;
}

describe('DraftScreen active-slot highlight', () => {
  it('has exactly one active ban slot, on our row at step 0', async () => {
    const container = await startDraft();
    const active = container.querySelectorAll('.ban-rows .ban-slot.active');
    expect(active.length).toBe(1);
    expect(container.querySelectorAll('.ban-row.us .ban-slot.active').length).toBe(1);
    expect(container.querySelectorAll('.ban-row.them .ban-slot.active').length).toBe(0);
  });

  it('moves the active ban slot to the other team after a ban', async () => {
    const container = await startDraft();
    // Blue (us) bans first; apply one ban, cursor advances to red (them).
    fireEvent.click(screen.getByTitle('Aatrox'));
    await screen.findByTitle('Aatrox — Banned');

    const active = container.querySelectorAll('.ban-rows .ban-slot.active');
    expect(active.length).toBe(1);
    expect(container.querySelectorAll('.ban-row.them .ban-slot.active').length).toBe(1);
    expect(container.querySelectorAll('.ban-row.us .ban-slot.active').length).toBe(0);
  });
});
