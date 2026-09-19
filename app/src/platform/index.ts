/**
 * Platform adapter. This is the ONLY module allowed to touch platform / DOM
 * file APIs. Everything else (engine, ui logic) stays platform-agnostic so the
 * frontend can later run inside a WPF WebView2 host.
 */

/** Open a native file picker and read the chosen file as text. */
export function pickAndReadTextFile(
  accept: string,
): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsText(file);
    });

    // If the dialog is cancelled no `change` event fires; there is no reliable
    // cross-browser cancel event, so the promise simply stays pending. Callers
    // treat a resolved `null` as "no file chosen".
    input.click();
  });
}

/** Result of a {@link fetchText} network request. */
export interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string;
}

interface WebViewFetchResult extends FetchTextResult {
  type: 'fetch-result';
  id: number;
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage(message: unknown): void;
        addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
        removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
      };
    };
  }
}

let fetchId = 0;
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Fetch a URL's body as text via the host. In the WebView2 host the request is
 * proxied through the native shell (which is not subject to browser CORS); in
 * the browser dev server it goes through the Vite `/__proxy/op.gg` rule. This is
 * the only outbound network call in the app and is always user-initiated.
 */
export function fetchText(url: string): Promise<FetchTextResult> {
  const webview = window.chrome?.webview;
  if (webview) {
    return new Promise<FetchTextResult>((resolve) => {
      const id = ++fetchId;
      const timer = window.setTimeout(() => {
        webview.removeEventListener('message', onMessage);
        resolve({ ok: false, status: 0, text: 'Request timed out' });
      }, FETCH_TIMEOUT_MS);
      const onMessage = (event: { data: unknown }): void => {
        const data = event.data as WebViewFetchResult;
        if (data?.type !== 'fetch-result' || data.id !== id) return;
        window.clearTimeout(timer);
        webview.removeEventListener('message', onMessage);
        resolve({ ok: data.ok, status: data.status, text: data.text });
      };
      webview.addEventListener('message', onMessage);
      webview.postMessage({ type: 'fetch', id, url });
    });
  }

  // Browser dev: route op.gg through the Vite proxy (see vite.config.ts).
  const proxied = url.replace(/^https:\/\/op\.gg/i, '/__proxy/op.gg');
  return fetch(proxied)
    .then(async (res) => ({ ok: res.ok, status: res.status, text: await res.text() }))
    .catch((err: unknown) => ({
      ok: false,
      status: 0,
      text: err instanceof Error ? err.message : String(err),
    }));
}

/** Trigger a download of the given text as a file. */
export function saveTextFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
