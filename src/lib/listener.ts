import { createSttProvider, type SttProvider } from './stt.js';

export function getSttProvider(): SttProvider {
  return createSttProvider();
}

export async function listenOnce(): Promise<string> {
  return getSttProvider().transcribe();
}
