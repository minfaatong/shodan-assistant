import { writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PATHS } from './config.js';

const SR = 22050;

function generateWav(path: string, freq: number, dur: number): void {
  if (existsSync(path)) return;
  const n = Math.floor(SR * dur);
  const samples = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const val = Math.round(0.5 * 32767 * (i < n / 2 ? 1 : -1));
    samples.writeInt16LE(val, i * 2);
  }
  const dataLen = samples.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  writeFileSync(path, Buffer.concat([header, samples]));
}

export function ensureBeeps(): void {
  generateWav(PATHS.BEEP_START, 880, 0.08);
  generateWav(PATHS.BEEP_END, 660, 0.10);
}

function afplay(path: string): void {
  try {
    execFileSync('afplay', [path], { timeout: 3000, stdio: 'ignore' });
  } catch {}
}

export function beepStart(): void {
  afplay(PATHS.BEEP_START);
}

export function beepEnd(): void {
  afplay(PATHS.BEEP_END);
}

export function beepEndDouble(): void {
  afplay(PATHS.BEEP_END);
  try {
    execFileSync('sleep', ['0.15'], { stdio: 'ignore' });
  } catch {}
  afplay(PATHS.BEEP_END);
}
