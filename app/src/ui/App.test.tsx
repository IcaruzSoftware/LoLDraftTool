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
    // Curated files missing -> loader falls back to neutral defaults.
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('goes from setup to draft and records a ban from the grid', async () => {
    render(<App />);

    // Setup screen renders once data loads.
    const demo = await screen.findByRole('button', { name: 'Use demo pool' });
    fireEvent.click(demo);
    fireEvent.click(screen.getByRole('button', { name: 'Start Draft' }));

    // Draft screen shows a ban-phase header.
    expect(await screen.findByText(/BAN PHASE 1/i)).toBeInTheDocument();

    // Click Aatrox in the grid; it becomes an (us) ban.
    fireEvent.click(screen.getByTitle('Aatrox'));
    expect(screen.getByTitle('Aatrox — Banned')).toBeInTheDocument();
  });
});
