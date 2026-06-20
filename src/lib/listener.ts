import { createSttProvider, type SttProvider } from './stt.js';

let _stt: SttProvider | null = null;

export function getSttProvider(): SttProvider {
  if (!_stt) _stt = createSttProvider();
  return _stt;
}

export async function listenOnce(): Promise<string> {
  return getSttProvider().transcribe();
}
