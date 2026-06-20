import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'shodan_log.log');

function ts(): string {
  return new Date().toISOString();
}

let initPromise: Promise<void> | null = null;

async function ensureDir(): Promise<void> {
  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true });
  }
}

export function log(...args: unknown[]): void {
  const line = `[${ts()}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  if (!initPromise) {
    initPromise = ensureDir();
  }
  initPromise.then(() => appendFile(LOG_FILE, line)).catch(() => {});
}

export function logError(err: unknown, context?: string): void {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  log(`ERROR${context ? ` [${context}]` : ''}: ${msg}`);
}
