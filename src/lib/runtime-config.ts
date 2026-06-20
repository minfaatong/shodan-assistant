import {
  LLM_PROVIDER as ENV_LLM_PROVIDER,
  LLAMA_MODEL, OPENROUTER_MODEL, OLLAMA_MODEL,
  STT_PROVIDER as ENV_STT_PROVIDER,
  WHISPER_MODEL,
  TTS_PROVIDER as ENV_TTS_PROVIDER,
  OPENAI_TTS_VOICE,
  OPENAI_API_KEY,
  OPENROUTER_API_KEY,
  type LlmProviderType,
  type SttProviderType,
  type TtsProviderType,
} from './config.js';

// ── Provider option definitions (deduplicated) ──────────────────────

export type ProviderKind = 'llm' | 'stt' | 'tts';

interface ModelOption {
  id: string;
  label: string;
}

interface ProviderOption {
  id: string;
  label: string;
  models?: ModelOption[];
}

export const LLM_PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'llama', label: 'llama.cpp (local)', models: [{ id: 'auto', label: 'auto (server default)' }] },
  { id: 'openrouter', label: 'OpenRouter (cloud)', models: [
    { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
    { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
    { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  ] },
  { id: 'ollama', label: 'Ollama (local)', models: [
    { id: 'llama3.2', label: 'Llama 3.2' },
    { id: 'qwen3', label: 'Qwen3' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'phi4', label: 'Phi-4' },
    { id: 'deepseek-r1', label: 'DeepSeek R1' },
  ] },
  { id: 'openai', label: 'OpenAI (cloud)', models: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ] },
];

export const STT_PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'local', label: 'Qwen3-ASR (local)' },
  { id: 'whispercpp', label: 'whisper.cpp (local)', models: [
    { id: 'tiny', label: 'Tiny' },
    { id: 'small', label: 'Small' },
    { id: 'medium', label: 'Medium' },
    { id: 'large', label: 'Large' },
  ] },
  { id: 'openai', label: 'OpenAI Whisper (cloud)' },
];

export const TTS_PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'local', label: 'Kokoro (local)' },
  { id: 'openai', label: 'OpenAI TTS (cloud)', models: [
    { id: 'alloy', label: 'Alloy' },
    { id: 'echo', label: 'Echo' },
    { id: 'fable', label: 'Fable' },
    { id: 'onyx', label: 'Onyx' },
    { id: 'nova', label: 'Nova' },
    { id: 'shimmer', label: 'Shimmer' },
  ] },
];

function findProvider(kind: ProviderKind, id: string): ProviderOption | undefined {
  const list = kind === 'llm' ? LLM_PROVIDER_OPTIONS
    : kind === 'stt' ? STT_PROVIDER_OPTIONS
    : TTS_PROVIDER_OPTIONS;
  return list.find(p => p.id === id);
}

// ── Aliases for voice matching ──────────────────────────────────────

const KIND_ALIASES: Record<string, ProviderKind> = {
  llm: 'llm', thinking: 'llm', brain: 'llm', model: 'llm',
  stt: 'stt', listening: 'stt', speech: 'stt', 'speech-to-text': 'stt', transcription: 'stt',
  tts: 'tts', speaking: 'tts', voice: 'tts', 'text-to-speech': 'tts',
};

const PROVIDER_ALIASES: Record<string, string> = {
  'llama.cpp': 'llama', 'llama cpp': 'llama', llama: 'llama',
  openrouter: 'openrouter', 'open router': 'openrouter',
  ollama: 'ollama',
  openai: 'openai', 'open ai': 'openai',
  qwen3: 'local', 'qwen 3': 'local',
  'whisper.cpp': 'whispercpp', 'whisper cpp': 'whispercpp', whisper: 'whispercpp',
  kokoro: 'local',
};

// ── Runtime config state ─────────────────────────────────────────────

export interface RuntimeSelections {
  llm: { provider: string; model?: string; };
  stt: { provider: string; model?: string; };
  tts: { provider: string; model?: string; };
}

function initSelections(): RuntimeSelections {
  return {
    llm: { provider: ENV_LLM_PROVIDER, model: resolveDefaultLlmModel(ENV_LLM_PROVIDER) },
    stt: { provider: ENV_STT_PROVIDER, model: ENV_STT_PROVIDER === 'whispercpp' ? WHISPER_MODEL : undefined },
    tts: { provider: ENV_TTS_PROVIDER, model: ENV_TTS_PROVIDER === 'openai' ? OPENAI_TTS_VOICE : undefined },
  };
}

function resolveDefaultLlmModel(provider: string): string | undefined {
  switch (provider) {
    case 'llama': return LLAMA_MODEL;
    case 'openrouter': return OPENROUTER_MODEL;
    case 'ollama': return OLLAMA_MODEL;
    case 'openai': return 'gpt-4o';
    default: return undefined;
  }
}

let _current: RuntimeSelections = initSelections();

export function getRuntimeConfig(): RuntimeSelections {
  return _current;
}

export function resetRuntimeConfig(): void {
  _current = initSelections();
}

// ── Voice command matching ──────────────────────────────────────────

function matchKind(transcript: string): ProviderKind | null {
  const lower = transcript.toLowerCase();
  for (const [word, kind] of Object.entries(KIND_ALIASES)) {
    if (lower.includes(word)) return kind;
  }
  return null;
}

function matchProvider(transcript: string): string | null {
  const lower = transcript.toLowerCase();
  for (const [alias, id] of Object.entries(PROVIDER_ALIASES)) {
    if (lower.includes(alias)) return id;
  }
  return null;
}

function matchModel(transcript: string, providerId: string): string | undefined {
  const lower = transcript.toLowerCase();
  const prov = findProvider('llm', providerId)
    || findProvider('stt', providerId)
    || findProvider('tts', providerId);
  if (!prov?.models) return undefined;
  for (const m of prov.models) {
    if (lower.includes(m.id.toLowerCase()) || lower.includes(m.label.toLowerCase())) {
      return m.id;
    }
  }
  return undefined;
}

const SWITCH_WORDS = ['switch', 'change', 'set', 'use', 'try'];

function isSwitchCommand(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  return SWITCH_WORDS.some(w => lower.includes(w));
}

// ── Public API ───────────────────────────────────────────────────────

export interface SwitchResult {
  kind: ProviderKind;
  provider: string;
  model?: string;
  description?: string;
}

export function parseSwitchCommand(transcript: string): SwitchResult | null {
  if (!isSwitchCommand(transcript)) return null;

  const kind = matchKind(transcript);
  if (!kind) return null;

  const providerId = matchProvider(transcript);
  if (!providerId) return null;

  const prov = findProvider(kind, providerId);
  if (!prov) return null;

  const modelId = matchModel(transcript, providerId);

  return {
    kind,
    provider: providerId,
    model: modelId,
    description: `${prov.label}${modelId ? ` (${modelId})` : ''}`,
  };
}

export function applySwitch(sw: SwitchResult): string {
  const sel = _current[sw.kind];
  sel.provider = sw.provider;
  if (sw.model) sel.model = sw.model;

  const prov = findProvider(sw.kind, sw.provider);
  return `Switched ${sw.kind.toUpperCase()} to ${prov?.label ?? sw.provider}${sw.model ? ` (${sw.model})` : ''}`;
}

// ── Resolve env var equivalents for provider construction ────────────

export function getLlmProviderType(): LlmProviderType {
  return _current.llm.provider as LlmProviderType;
}

export function getLlmModel(): string {
  const sel = _current.llm;
  return sel.model ?? resolveDefaultLlmModel(sel.provider) ?? 'gpt-4o';
}

export function getSttProviderType(): SttProviderType {
  return _current.stt.provider as SttProviderType;
}

export function getWhisperModel(): string {
  return _current.stt.model ?? 'small';
}

export function getTtsProviderType(): TtsProviderType {
  return _current.tts.provider as TtsProviderType;
}

export function getTtsVoice(): string {
  return _current.tts.model ?? 'alloy';
}
