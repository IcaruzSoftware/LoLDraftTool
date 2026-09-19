import { describe, it } from 'vitest';

// DOM-only file picker / download flows are not exercised in jsdom; these are
// placeholders to be filled once the platform behaviour is testable.
describe.skip('platform adapter', () => {
  it('pickAndReadTextFile resolves the chosen file', () => {});
  it('saveTextFile triggers a download', () => {});
});
