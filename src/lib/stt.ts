import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  PATHS, OPENAI_API_KEY, GOOGLE_API_KEY,
  WHISPER_MODEL_PATH as ENV_WHISPER_MODEL_PATH,
  WHISPER_LANG,
} from './config.js';
import { getSttProviderType, getWhisperModel, getApiKey } from './runtime-config.js';

const execFile = promisify(execFileCb);

export interface SttProvider {
  name: string;
  transcribe(signal?: AbortSignal): Promise<string>;
}

// ── Shared: record-only helper ────────────────────────────────────

async function recordOnly(signal?: AbortSignal): Promise<string> {
  const { stdout } = await execFile('bash', [PATHS.LISTEN_SH, 'qwen3', '--record-only'], {
    signal,
    timeout: 120_000,
  });
  return (stdout ?? '').trim();
}

// ── Local (Qwen3-ASR via listen_stream.sh) ─────────────────────────

class LocalStt implements SttProvider {
  name = 'local (Qwen3-ASR)';

  async transcribe(signal?: AbortSignal): Promise<string> {
    const { stdout } = await execFile('bash', [PATHS.LISTEN_SH, 'qwen3'], {
      signal,
      timeout: 120_000,
    });
    return (stdout ?? '').trim();
  }
}

// ── whisper.cpp ───────────────────────────────────────────────────

class WhisperCppStt implements SttProvider {
  private modelSize: string;

  constructor(modelSize?: string) {
    this.modelSize = modelSize ?? 'small';
  }

  get name(): string {
    return `whisper.cpp (${this.modelSize})`;
  }

  private resolveModelPath(): string {
    return ENV_WHISPER_MODEL_PATH || join(
      homedir(), '.cache', 'whisper-cpp', `ggml-${this.modelSize}.bin`,
    );
  }

  async transcribe(signal?: AbortSignal): Promise<string> {
    const wavPath = await recordOnly(signal);
    if (!wavPath) return '';

    const modelPath = this.resolveModelPath();

    if (!existsSync(modelPath)) {
      throw new Error(
        `whisper.cpp model not found at ${modelPath}. ` +
        `Set WHISPER_MODEL_PATH or download the "${this.modelSize}" model.`,
      );
    }

    const { stdout } = await execFile('whisper-cli', [
      '-m', modelPath,
      '-f', wavPath,
      '-l', WHISPER_LANG,
      '-np', '-nt',
    ], { signal, timeout: 120_000 });

    return (stdout ?? '').trim();
  }
}

// ── OpenAI Whisper ─────────────────────────────────────────────────

class OpenAiStt implements SttProvider {
  name = 'OpenAI Whisper';

  async transcribe(signal?: AbortSignal): Promise<string> {
    const wavPath = await recordOnly(signal);
    if (!wavPath) return '';

    const form = new FormData();
    form.set('model', 'whisper-1');
    form.set('language', 'en');
    form.set('response_format', 'text');
    const file = createReadStream(wavPath) as unknown as Blob;
    form.set('file', file, 'audio.wav');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      signal,
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI STT HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return ((await res.text()) ?? '').trim();
  }
}

// ── Google Cloud Speech-to-Text ──────────────────────────────────

class GoogleStt implements SttProvider {
  name = 'Google STT';

  async transcribe(signal?: AbortSignal): Promise<string> {
    const wavPath = await recordOnly(signal);
    if (!wavPath) return '';

    const { readFileSync } = await import('node:fs');
    const audioBase64 = readFileSync(wavPath).toString('base64');

    const apiKey = getApiKey('stt') || GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

    const res = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            model: 'latest_long',
          },
          audio: { content: audioBase64 },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google STT HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      results?: { alternatives?: { transcript?: string }[] }[];
    };
    const parts = (data.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript ?? '')
      .filter(Boolean);
    return parts.join(' ').trim();
  }
}

// ── Factory (always reads runtime config) ────────────────────────

export function createSttProvider(): SttProvider {
  const type = getSttProviderType();

  switch (type) {
    case 'whispercpp':
      return new WhisperCppStt(getWhisperModel());
    case 'openai':
      return new OpenAiStt();
    case 'google':
      return new GoogleStt();
    default:
      return new LocalStt();
  }
}
