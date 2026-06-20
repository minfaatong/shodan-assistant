import {
  LLM_PROVIDER,
  LLAMA_BASE, LLAMA_MODEL,
  OPENROUTER_API_KEY, OPENROUTER_MODEL,
  OLLAMA_BASE, OLLAMA_MODEL,
  SYSTEM_PROMPT, LLM_TIMEOUT,
} from './config.js';

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
  name = `llama.cpp (${LLAMA_MODEL})`;

  async complete(prompt: string): Promise<string> {
    return chatCompletions(LLAMA_BASE, LLAMA_MODEL, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);
  }
}

// ── OpenRouter ─────────────────────────────────────────────────

class OpenRouterProvider implements LlmProvider {
  name = `OpenRouter (${OPENROUTER_MODEL})`;

  async complete(prompt: string): Promise<string> {
    return chatCompletions(
      'https://openrouter.ai/api/v1',
      OPENROUTER_MODEL,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      OPENROUTER_API_KEY,
    );
  }
}

// ── Ollama ────────────────────────────────────────────────────

class OllamaProvider implements LlmProvider {
  name = `Ollama (${OLLAMA_MODEL})`;

  async complete(prompt: string): Promise<string> {
    return chatCompletions(OLLAMA_BASE, OLLAMA_MODEL, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]);
  }
}

// ── Factory ──────────────────────────────────────────────────

let _llmProvider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (!_llmProvider) {
    switch (LLM_PROVIDER) {
      case 'openrouter':
        _llmProvider = new OpenRouterProvider();
        break;
      case 'ollama':
        _llmProvider = new OllamaProvider();
        break;
      default:
        _llmProvider = new LlamaCppProvider();
    }
  }
  return _llmProvider;
}
