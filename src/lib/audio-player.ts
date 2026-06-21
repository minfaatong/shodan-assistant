import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

type Player = 'afplay' | 'aplay' | 'paplay' | 'ffplay';

function detectPlayer(): Player {
  const p = platform();
  if (p === 'darwin') return 'afplay';
  // Linux or WSL: try aplay first, check which exist
  try {
    execFileSync('which', ['aplay'], { stdio: 'ignore' });
    return 'aplay';
  } catch {
    try {
      execFileSync('which', ['paplay'], { stdio: 'ignore' });
      return 'paplay';
    } catch {
      return 'ffplay';
    }
  }
}

let cachedPlayer: Player | null = null;

function getPlayer(): Player {
  if (!cachedPlayer) cachedPlayer = detectPlayer();
  return cachedPlayer;
}

export function playAudio(path: string, timeout = 5000): void {
  try {
    const player = getPlayer();
    if (player === 'ffplay') {
      execFileSync('ffplay', ['-nodisp', '-autoexit', path], { timeout, stdio: 'ignore' });
    } else {
      execFileSync(player, [path], { timeout, stdio: 'ignore' });
    }
  } catch {}
}
