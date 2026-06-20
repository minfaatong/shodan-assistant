import { execFile as execFileCb, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { PATHS, TTS_PROVIDER, OPENAI_API_KEY, OPENAI_TTS_VOICE, QUICK_RESPONSES, TTS_TIMEOUT } from './config.js';
import { beepStart, beepEnd } from './beeps.js';
import { splitResponse } from './split.js';

const execFile = promisify(execFileCb);

export interface TtsProvider {
  name: string;
  speak(text: string): Promise<void>;
}

// ── Quick clip helper (shared) ────────────────────────────────────

function quickClip(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[.,!?]+$/, '');
  let clip: string | undefined;
  for (const [key, val] of Object.entries(QUICK_RESPONSES)) {
    if (t.includes(key)) {
      clip = val;
      break;
    }
  }
  if (!clip) return false;
  const path = `${PATHS.QUICK_DIR}/${clip}_slow.wav`;
  if (!existsSync(path)) return false;
  try {
    execFileSync('afplay', [path], { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ── Local (Kokoro via say.sh) ──────────────────────────────────────

class LocalTts implements TtsProvider {
  name = 'local (Kokoro bf_isabella)';

  async speak(text: string): Promise<void> {
    if (!text) return;
    const out = `/tmp/_shodan_tts_${process.pid}.wav`;
    try {
      const { stderr } = await execFile('bash', [PATHS.SAY_SH, text, out], {
        timeout: TTS_TIMEOUT,
      });
      if (stderr) console.error(`[TTS] say.sh: ${String(stderr).slice(0, 200)}`);
    } catch (err) {
      console.error(`[TTS] error: ${err}`);
    } finally {
      for (const p of [out, out.replace('.wav', '_slow.wav')]) {
        try { unlinkSync(p); } catch {}
      }
    }
  }
}

// ── OpenAI TTS ─────────────────────────────────────────────────────

class OpenAiTts implements TtsProvider {
  name = 'OpenAI TTS';

  async speak(text: string): Promise<void> {
    if (!text) return;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: OPENAI_TTS_VOICE,
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const out = `/tmp/_shodan_tts_${process.pid}.mp3`;
    writeFileSync(out, buf);

    try {
      execFileSync('afplay', [out], { timeout: 30000, stdio: 'ignore' });
    } finally {
      try { unlinkSync(out); } catch {}
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────

let _ttsProvider: TtsProvider | null = null;

export function getTtsProvider(): TtsProvider {
  if (!_ttsProvider) {
    switch (TTS_PROVIDER) {
      case 'openai':
        _ttsProvider = new OpenAiTts();
        break;
      default:
        _ttsProvider = new LocalTts();
    }
  }
  return _ttsProvider;
}

// ── High-level helpers ─────────────────────────────────────────────

export async function speakOne(text: string): Promise<void> {
  if (!text) return;
  if (quickClip(text)) return;
  await getTtsProvider().speak(text);
}

export async function speakChunked(response: string, gap: number): Promise<void> {
  if (!response) return;

  beepStart();

  const chunks = splitResponse(response);
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Speaker] [SHODAN] ${chunks[i]}`);
    await speakOne(chunks[i]);
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, gap * 1000));
    }
  }
}
