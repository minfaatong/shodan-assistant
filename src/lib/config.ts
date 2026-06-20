import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { env } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_DIR = resolve(__dirname, '..', '..');

export const PATHS = {
  SAY_SH: resolve(homedir(), '.qclaw/skills/isabella-tts/scripts/say.sh'),
  LISTEN_SH: resolve(SKILL_DIR, 'scripts', 'listen_stream.sh'),
  BEEP_START: '/tmp/beep_start.wav',
  BEEP_END: '/tmp/beep_end.wav',
  QUICK_DIR: '/tmp/shodan_quick',
} as const;

// ── LLM ────────────────────────────────────────────────────────────

export type LlmProviderType = 'llama' | 'openrouter' | 'ollama' | 'openai' | 'cloudflare' | 'deepseek';

export const LLM_PROVIDER = (env.LLM_PROVIDER ?? 'llama') as LlmProviderType;
export const LLAMA_BASE = env.LLAMA_BASE ?? 'http://127.0.0.1:8080/v1';
export const LLAMA_MODEL = env.LLAMA_MODEL ?? 'Qwen3-8B-Q8_0.gguf';
export const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY ?? '';
export const OPENROUTER_MODEL = env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-20250514';
export const OLLAMA_BASE = env.OLLAMA_BASE ?? 'http://127.0.0.1:11434/v1';
export const OLLAMA_MODEL = env.OLLAMA_MODEL ?? 'llama3.2';
export const CLOUDFLARE_API_KEY = env.CLOUDFLARE_API_KEY ?? '';
export const CLOUDFLARE_ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID ?? '';
export const CLOUDFLARE_MODEL = env.CLOUDFLARE_MODEL ?? '@cf/zai-org/glm-5.2';
export const DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY ?? '';
export const DEEPSEEK_BASE = env.DEEPSEEK_BASE ?? 'https://api.deepseek.com';

// ── STT ────────────────────────────────────────────────────────────

export type SttProviderType = 'local' | 'openai' | 'whispercpp' | 'google';

export const STT_PROVIDER = (env.STT_PROVIDER ?? 'local') as SttProviderType;
export const WHISPER_MODEL = env.WHISPER_MODEL ?? 'small';
export const WHISPER_MODEL_PATH = env.WHISPER_MODEL_PATH ?? '';
export const WHISPER_LANG = env.WHISPER_LANG ?? 'en';

// ── TTS ────────────────────────────────────────────────────────────

export type TtsProviderType = 'local' | 'openai' | 'google';

export const TTS_PROVIDER = (env.TTS_PROVIDER ?? 'local') as TtsProviderType;
export const OPENAI_TTS_VOICE = env.OPENAI_TTS_VOICE ?? 'alloy';

// ── Shared API keys ────────────────────────────────────────────────

export const OPENAI_API_KEY = env.OPENAI_API_KEY ?? '';
export const GOOGLE_API_KEY = env.GOOGLE_API_KEY ?? '';

// ── System ─────────────────────────────────────────────────────────

export const SYSTEM_PROMPT =
  'You are Shodan, a calm, direct voice assistant. ' +
  'Keep responses short \u2014 one or two sentences maximum. ' +
  'You initiate each turn with a clear prompt or question.';

export const GREETINGS = [
  'Hi, I\'m Shodan. What can I do for you today?',
  'Hey, Shodan here. What would you like help with?',
  'Hello, I\'m ready. What shall we work on?',
];

export const QUICK_RESPONSES: Record<string, string> = {
  "i'm here": 'im_here',
  'im here': 'im_here',
  here: 'im_here',
  'go ahead': 'go_ahead',
  'go ahead.': 'go_ahead',
  okay: 'okay',
  'okay.': 'okay',
  ok: 'okay',
  sure: 'sure',
  'sure.': 'sure',
  'mm-hm': 'mmhm',
  'mm hm': 'mmhm',
  'one moment': 'one_moment',
  'one sec': 'one_moment',
  wait: 'one_moment',
  sorry: 'sorry',
  'sorry?': 'sorry',
  what: 'sorry',
  huh: 'sorry',
  "didn't catch": 'didnt_catch',
  'didnt catch': 'didnt_catch',
};

export const MAX_CHUNK = 200;
export const DEFAULT_GAP = 1.2;
export const LISTEN_TIMEOUT = 120_000;
export const LLM_TIMEOUT = 120_000;
export const TTS_TIMEOUT = 90_000;
export const RECORD_TIMEOUT = 120_000;
