import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  PATHS, STT_PROVIDER, OPENAI_API_KEY,
  WHISPER_MODEL, WHISPER_MODEL_PATH, WHISPER_LANG,
} from './config.js';

const execFile = promisify(execFileCb);

export interface SttProvider {
  name: string;
  transcribe(): Promise<string>;
}

// ── Shared: record-only helper ────────────────────────────────────

async function recordOnly(): Promise<string> {
  const { stdout } = await execFile('bash', [PATHS.LISTEN_SH, 'qwen3', '--record-only'], {
    timeout: 120_000,
  });
  return (stdout ?? '').trim();
}

// ── Local (Qwen3-ASR via listen_stream.sh) ─────────────────────────

class LocalStt implements SttProvider {
  name = 'local (Qwen3-ASR)';

  async transcribe(): Promise<string> {
    const { stdout } = await execFile('bash', [PATHS.LISTEN_SH, 'qwen3'], {
      timeout: 120_000,
    });
    return (stdout ?? '').trim();
  }
}

// ── whisper.cpp ───────────────────────────────────────────────────

class WhisperCppStt implements SttProvider {
  get name(): string {
    const modelPath = this.resolveModelPath();
    const basename = modelPath.split('/').pop()?.replace(/^ggml-/, '').replace(/\.bin$/, '') ?? WHISPER_MODEL;
    return `whisper.cpp (${basename})`;
  }

  private resolveModelPath(): string {
    return WHISPER_MODEL_PATH || join(
      homedir(), '.cache', 'whisper-cpp', `ggml-${WHISPER_MODEL}.bin`,
    );
  }

  async transcribe(): Promise<string> {
    const wavPath = await recordOnly();
    if (!wavPath) return '';

    const modelPath = this.resolveModelPath();

    if (!existsSync(modelPath)) {
      throw new Error(
        `whisper.cpp model not found at ${modelPath}. ` +
        `Set WHISPER_MODEL_PATH or download the "${WHISPER_MODEL}" model.`,
      );
    }

    const { stdout } = await execFile('whisper-cli', [
      '-m', modelPath,
      '-f', wavPath,
      '-l', WHISPER_LANG,
      '-np', '-nt',
    ], { timeout: 120_000 });

    return (stdout ?? '').trim();
  }
}

// ── OpenAI Whisper ─────────────────────────────────────────────────

class OpenAiStt implements SttProvider {
  name = 'OpenAI Whisper';

  async transcribe(): Promise<string> {
    const wavPath = await recordOnly();
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
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI STT HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return ((await res.text()) ?? '').trim();
  }
}

// ── Factory ────────────────────────────────────────────────────────

export function createSttProvider(): SttProvider {
  switch (STT_PROVIDER) {
    case 'whispercpp':
      return new WhisperCppStt();
    case 'openai':
      return new OpenAiStt();
    default:
      return new LocalStt();
  }
}
