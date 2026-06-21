import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PATHS, OPENAI_API_KEY, GOOGLE_API_KEY, QUICK_RESPONSES, TTS_TIMEOUT } from './config.js';
import { getTtsProviderType, getTtsVoice, getApiKey } from './runtime-config.js';
import { beepStart } from './beeps.js';
import { logError } from './logger.js';
import { playAudio } from './audio-player.js';

function tmpFile(ext: string): string {
  const dir = join(tmpdir(), 'shodan');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `tts_${process.pid}_${Date.now()}.${ext}`);
}

const execFile = promisify(execFileCb);

export interface TtsProvider {
  name: string;
  speak(text: string, signal?: AbortSignal): Promise<void>;
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
  playAudio(path, 5000);
  return true;
}

// ── Local (Kokoro via say.sh) ──────────────────────────────────────

class LocalTts implements TtsProvider {
  name = 'local (Kokoro bf_isabella)';

  async speak(text: string, signal?: AbortSignal): Promise<void> {
    if (!text) return;
    const out = tmpFile('wav');
    try {
      await execFile('bash', [PATHS.SAY_SH, text, out], {
        signal,
        timeout: TTS_TIMEOUT,
      });
      if (!signal?.aborted) playAudio(out, 30000);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logError(err, 'TTS');
    } finally {
      try { unlinkSync(out); } catch {}
    }
  }
}

// ── OpenAI TTS ─────────────────────────────────────────────────────

class OpenAiTts implements TtsProvider {
  private voice: string;
  constructor(voice?: string) { this.voice = voice ?? 'alloy'; }
  get name(): string { return `OpenAI TTS (${this.voice})`; }

  async speak(text: string, signal?: AbortSignal): Promise<void> {
    if (!text) return;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model: 'tts-1',
        voice: this.voice,
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const out = tmpFile('mp3');
    writeFileSync(out, buf);

    try {
      playAudio(out, 30000);
    } finally {
      try { unlinkSync(out); } catch {}
    }
  }
}

// ── Google Cloud Text-to-Speech ─────────────────────────────────

class GoogleTts implements TtsProvider {
  private voice: string;
  constructor(voice?: string) { this.voice = voice ?? 'en-US-Neural2-D'; }
  get name(): string { return `Google TTS (${this.voice})`; }

  async speak(text: string, signal?: AbortSignal): Promise<void> {
    if (!text) return;

    const apiKey = getApiKey('tts') || GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', name: this.voice },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) throw new Error('Google TTS: empty response');

    const buf = Buffer.from(data.audioContent, 'base64');
    const out = tmpFile('mp3');
    writeFileSync(out, buf);

    try {
      playAudio(out, 30000);
    } finally {
      try { unlinkSync(out); } catch {}
    }
  }
}

// ── Factory (always reads runtime config) ─────────────────────

export function getTtsProvider(): TtsProvider {
  const type = getTtsProviderType();

  switch (type) {
    case 'openai':
      return new OpenAiTts(getTtsVoice());
    case 'google':
      return new GoogleTts(getTtsVoice());
    default:
      return new LocalTts();
  }
}

// ── High-level helpers ─────────────────────────────────────────────

export async function speakOne(text: string, signal?: AbortSignal): Promise<void> {
  if (!text) return;
  if (quickClip(text)) return;
  await getTtsProvider().speak(text, signal);
}

export async function speakChunked(response: string, gap: number, signal?: AbortSignal): Promise<void> {
  if (!response) return;

  beepStart();
  await speakOne(response, signal);
}
