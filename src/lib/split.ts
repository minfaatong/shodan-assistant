import { MAX_CHUNK } from './config.js';

export function splitResponse(text: string, maxChars = MAX_CHUNK): string[] {
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if (current.length + s.length + 1 <= maxChars) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);

      if (s.length > maxChars) {
        const parts = s.split(/(?<=[,;:])\s+/);
        current = '';
        for (const p of parts) {
          if (current.length + p.length + 1 <= maxChars) {
            current = (current + ' ' + p).trim();
          } else {
            if (current) chunks.push(current);
            current = p.trim();
          }
        }
        if (current) {
          chunks.push(current);
          current = '';
        }
      } else {
        current = s;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}
