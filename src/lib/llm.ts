import {
  LLAMA_BASE, LLAMA_MODEL as ENV_LLAMA_MODEL,
  OPENROUTER_API_KEY, OPENROUTER_MODEL as ENV_OPENROUTER_MODEL,
  OLLAMA_BASE, OLLAMA_MODEL as ENV_OLLAMA_MODEL,
  CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_MODEL as ENV_CLOUDFLARE_MODEL,
  DEEPSEEK_API_KEY, DEEPSEEK_BASE,
  SYSTEM_PROMPT, LLM_TIMEOUT,
} from './config.js';
import { getLlmProviderType, getLlmModel, getApiKey } from './runtime-config.js';

export interface LlmProvider {
  name: string;
  complete(prompt: string): Promise<string>;
}

// ── Shared call for OpenAI-compatible chat completions ────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chatCompletions(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  apiKey?: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 512,
        temperature: 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

// ── llama.cpp ───────────────────────────────────────────────────

class LlamaCppProvider implements LlmProvider {
  name = `llama.cpp (${ENV_LLAMA_MODEL})`;

  async complete(prompt: string): Promise<string> {
    return chatCompletions(LLAMA_BASE, ENV_LLAMA_MODEL, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);
  }
}

// ── OpenRouter ─────────────────────────────────────────────────

class OpenRouterProvider implements LlmProvider {
  private model: string;
  constructor(model?: string) { this.model = model ?? ENV_OPENROUTER_MODEL; }
  get name(): string { return `OpenRouter (${this.model})`; }

  async complete(prompt: string): Promise<string> {
    return chatCompletions(
      'https://openrouter.ai/api/v1',
      this.model,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      getApiKey('llm') || OPENROUTER_API_KEY,
    );
  }
}

// ── Ollama ────────────────────────────────────────────────────

class OllamaProvider implements LlmProvider {
  private model: string;
  constructor(model?: string) { this.model = model ?? ENV_OLLAMA_MODEL; }
  get name(): string { return `Ollama (${this.model})`; }

  async complete(prompt: string): Promise<string> {
    return chatCompletions(OLLAMA_BASE, this.model, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);
  }
}

// ── OpenAI (direct) ────────────────────────────────────────────

class OpenAiLlmProvider implements LlmProvider {
  private model: string;
  constructor(model?: string) { this.model = model ?? 'gpt-4o'; }
  get name(): string { return `OpenAI (${this.model})`; }

  async complete(prompt: string): Promise<string> {
    return chatCompletions(
      'https://api.openai.com/v1',
      this.model,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      getApiKey('llm') || process.env.OPENAI_API_KEY,
    );
  }
}

// ── Cloudflare Workers AI ─────────────────────────────────────

class CloudflareProvider implements LlmProvider {
  private model: string;
  constructor(model?: string) { this.model = model ?? ENV_CLOUDFLARE_MODEL; }
  get name(): string { return `Cloudflare (${this.model})`; }

  async complete(prompt: string): Promise<string> {
    const baseUrl = CLOUDFLARE_ACCOUNT_ID
      ? `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1`
      : 'https://api.cloudflare.com/client/v4/ai/v1';
    return chatCompletions(baseUrl, this.model, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ], getApiKey('llm') || CLOUDFLARE_API_KEY);
  }
}

// ── DeepSeek ────────────────────────────────────────────────

class DeepSeekProvider implements LlmProvider {
  private model: string;
  constructor(model?: string) { this.model = model ?? 'deepseek-chat'; }
  get name(): string { return `DeepSeek (${this.model})`; }

  async complete(prompt: string): Promise<string> {
    return chatCompletions(
      DEEPSEEK_BASE,
      this.model,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      getApiKey('llm') || DEEPSEEK_API_KEY,
    );
  }
}

// ── Factory (always reads runtime config) ─────────────────────

export function getLlmProvider(): LlmProvider {
  const type = getLlmProviderType();
  const model = getLlmModel();

  switch (type) {
    case 'openrouter':
      return new OpenRouterProvider(model);
    case 'ollama':
      return new OllamaProvider(model);
    case 'openai':
      return new OpenAiLlmProvider(model);
    case 'cloudflare':
      return new CloudflareProvider(model);
    case 'deepseek':
      return new DeepSeekProvider(model);
    default:
      return new LlamaCppProvider();
  }
}

export function resetLlmProvider(): void {
  // no cache held; getLlmProvider always creates fresh
}
