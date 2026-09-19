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
