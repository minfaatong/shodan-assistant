import { createSttProvider, type SttProvider } from './stt.js';

let abortController: AbortController | null = null;

export function abortListen(): void {
  abortController?.abort();
  abortController = null;
}

export function getSttProvider(): SttProvider {
  return createSttProvider();
}

export async function listenOnce(): Promise<string | null> {
  abortController = new AbortController();
  try {
    const result = await getSttProvider().transcribe(abortController.signal);
    return result ?? null;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    throw err;
  } finally {
    abortController = null;
  }
}
