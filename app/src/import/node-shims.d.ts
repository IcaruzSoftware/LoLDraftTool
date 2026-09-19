// Minimal ambient declarations for the Node built-ins used by test fixtures.
// The project does not depend on `@types/node`; these cover only what
// `fixtures.ts` needs so `tsc` stays green while tests run under Node.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
