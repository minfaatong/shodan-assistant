# Shodan Assistant

A voice-only AI assistant that runs on your Mac. Listens, thinks (via local or cloud LLM), and speaks back. Always initiates each conversation turn — never passively waits.

Built with TypeScript + [ink](https://github.com/vadimdemedes/ink) (React for CLIs) for a full-screen terminal UI with status indicators, conversation log, and live debugging.

```
┌──────────────────────────────────────────────────────┐
│  🎤 Listening — Shodan Voice Agent                    │  ← Status bar
├──────────────────────────────────────────────────────┤
│  LLM: llama.cpp (Qwen3-8B-Q8_0.gguf)                 │  ← Provider info
│  STT: local (Qwen3-ASR) | TTS: local (Kokoro)        │
├──────────────────────────────────────────────────────┤
│  You: what's the weather?                             │
│  Shodan: I'm not connected to weather services.       │  ← Conversation
│                                                      │
│  You: tell me a joke                                 │
│  Shodan: Why did the…                                │
├──────────────────────────────────────────────────────┤
│ [14:23:01] LLM response received                      │  ← Last log entry
└──────────────────────────────────────────────────────┘
```

## Architecture

```
┌─ STT (Speech-to-Text) ───────────────────────────────┐
│  Local: listen_stream.sh → Qwen3-ASR (CoreML)        │
│  Cloud: rec → OpenAI Whisper API                     │
│  1× beep at start, 1× beep at end                    │
│  Speech detected → transcript → Agent loop            │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ Agent Loop (async) ─────────────────────────────────┐
│  listenOnce() → queryLlm() → speakChunked()           │
│  Re-greets every ~20s when idle                      │
│  Provider-agnostic (llama.cpp / OpenRouter / Ollama) │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ TTS (Text-to-Speech) ───────────────────────────────┐
│  1× beep before speaking                             │
│  quick clip (pre-recorded) → TTS (Kokoro / OpenAI)   │
│  Chunks with silence gaps between them               │
└──────────────────────────────────────────────────────┘
```

## Architecture decisions

### Why TypeScript over Python?
The original prototype was a Python script (`shodan_agent.py`). The TypeScript rewrite was done to support ink (React for CLIs) for a rich terminal UI with spinners, persistent chat logs, and real-time status updates. Node.js `child_process` handles shell script integration, and `fetch` (built-in since Node 18) handles all LLM/cloud API calls without extra dependencies.

### Why provider pattern?
LLMs, STT, and TTS are interchangeable layers behind a common interface (`LlmProvider`, `SttProvider`, `TtsProvider`). This lets you mix and match:

- Use a fast local STT for privacy-sensitive queries
- Route the LLM to a cloud "thinking" model (Claude, GPT-4o, DeepSeek-R1) for complex tasks
- Fall back to local TTS when offline

Each provider is a class with a `name` and a single method (`complete()`, `transcribe()`, `speak()`). The factory (`getLlmProvider()`, etc.) returns the active instance based on environment variables.

### Why separate shell scripts for STT/TTS?
`listen_stream.sh` and `say.sh` handle platform-specific audio capture (SoX, afplay) and ML model management (`speech` CLI for Qwen3-ASR / Kokoro). This keeps the TypeScript layer clean — it just spawns processes and reads stdout. Cloud providers bypass the transcription/synthesis steps but still use the same recording/playback infrastructure.

### Why ink over other TUI frameworks?
Ink provides React components (`Box`, `Text`, `Static`, `Spacer`) with Yoga layout, making it straightforward to build a terminal UI. `<Static>` is key — it appends conversation messages that persist in the terminal buffer while the status bar and log line update in place. `useInput` handles keyboard shortcuts (`q` to quit).

## Prerequisites

### Required (all modes)
- **Node.js 22+** with npm
- **ffmpeg** (rubberband + aresample filters) — `brew install ffmpeg`
- **SoX** (rec for recording) — `brew install sox`
- **afplay** (built-in on macOS)
- **SwitchAudioSource** (mic selection) — `brew install switchaudio-osx`

### Local mode (default)
- **speech CLI** (Qwen3-ASR + Kokoro TTS):
  ```bash
  brew install speech  # or build from https://github.com/nickwanng/speech
  ```
- **llama.cpp server** at `http://127.0.0.1:8080`:
  ```bash
  # Download a model, then:
  ./server -m Qwen3-8B-Q8_0.gguf --host 127.0.0.1 --port 8080
  ```

### Cloud modes
- **OpenRouter**: Get an API key from [openrouter.ai](https://openrouter.ai/keys)
- **OpenAI**: Get an API key from [platform.openai.com](https://platform.openai.com/api-keys)
- **Ollama**: Install from [ollama.com](https://ollama.com) and pull a model

## Installation

```bash
git clone <repo-url>
cd shodan-assistant
npm install
```

## Quick start

```bash
# All local (requires llama.cpp + speech CLI)
npm start

# Quiet mode — log only, no spoken output
npm start -- --silent
```

## Configuration

All providers are configured via environment variables. Local defaults apply when nothing is set.

### LLM providers

| Env var | Default | Options |
|---------|---------|---------|
| `LLM_PROVIDER` | `llama` | `llama` \| `openrouter` \| `ollama` \| `openai` |
| `LLAMA_BASE` | `http://127.0.0.1:8080/v1` | any llama.cpp endpoint |
| `LLAMA_MODEL` | `Qwen3-8B-Q8_0.gguf` | model loaded on server |
| `OPENROUTER_API_KEY` | — | your OpenRouter API key |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4-20250514` | any OpenRouter model ID |
| `OLLAMA_BASE` | `http://localhost:11434` | any Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | any Ollama model |
| `OPENAI_API_KEY` | — | required for `openai` LLM provider |

### STT providers

| Env var | Default | Options |
|---------|---------|---------|
| `STT_PROVIDER` | `local` | `local` \| `whispercpp` \| `openai` |
| `WHISPER_MODEL` | `small` | `tiny` \| `small` \| `medium` \| `large` |
| `WHISPER_MODEL_PATH` | (auto) | explicit path to `ggml-*.bin` model file |
| `WHISPER_LANG` | `en` | language code for whisper.cpp |
| `OPENAI_API_KEY` | — | required for `openai` provider |

### TTS providers

| Env var | Default | Options |
|---------|---------|---------|
| `TTS_PROVIDER` | `local` | `local` \| `openai` |
| `OPENAI_API_KEY` | — | required for `openai` provider |
| `OPENAI_TTS_VOICE` | `alloy` | `alloy` \| `echo` \| `fable` \| `onyx` \| `nova` \| `shimmer` |

### Examples

```bash
# Default: all local
npm start

# OpenRouter for smarter LLM, everything else local
OPENROUTER_API_KEY=sk-or-... LLM_PROVIDER=openrouter npm start

# OpenAI for everything
LLM_PROVIDER=openrouter OPENROUTER_API_KEY=sk-or-... \
STT_PROVIDER=openai TTS_PROVIDER=openai \
OPENAI_API_KEY=sk-... npm start

# Ollama as LLM backend
LLM_PROVIDER=ollama OLLAMA_MODEL=llama3.2 npm start

# whisper.cpp as STT (offline, different model from Qwen3)
STT_PROVIDER=whispercpp npm start

# whisper.cpp with specific model & custom path
STT_PROVIDER=whispercpp WHISPER_MODEL=medium WHISPER_MODEL_PATH=/path/to/ggml-medium.bin npm start
```

## Runtime switching

Providers and models can be changed mid-session by voice. Say any of:

- `"switch LLM to OpenAI"`
- `"use OpenRouter for thinking"`
- `"set TTS to local"`
- `"change STT to whisper"`
- `"switch model to claude"` (changes model within current LLM provider)

| Category | Recognized providers |
|----------|---------------------|
| LLM | llama.cpp, OpenRouter, Ollama, OpenAI |
| STT | Qwen3-ASR (local), whisper.cpp, OpenAI Whisper |
| TTS | Kokoro (local), OpenAI TTS |

Voice switching updates the provider and model dynamically — no restart needed. The provider names in the status bar reflect changes immediately.

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--intro TEXT` | (greeting list) | Override startup greeting |
| `--gap SECONDS` | 1.2 | Silence between response chunks |
| `--silent` | false | Log only, no TTS output |
| `--no-warmup` | false | Skip ASR/TTS warmup |
| `-h, --help` | | Show help |

## TUI controls

| Key | Action |
|-----|--------|
| `q` | Quit |
| `Ctrl+C` | Quit |

## File structure

```
src/
├── index.tsx                  # Entry point (parses CLI args, renders <App>)
├── app.tsx                    # State management, keyboard input, layout
├── components/
│   ├── status-bar.tsx         # Animated spinner + current state label
│   ├── chat.tsx               # Static persistent conversation log
│   └── log-panel.tsx          # Last log entry at the bottom
└── lib/
    ├── agent.ts               # Async agent loop (orchestrates LLM/STT/TTS)
    ├── runtime-config.ts      # Runtime provider/model switching (voice-activated)
    ├── config.ts              # Environment variable bindings
    ├── types.ts               # Shared types (Status, Message, AgentState)
    ├── beeps.ts               # WAV generation + afplay helper
    ├── llm.ts                 # LLM providers (llama.cpp, OpenRouter, Ollama)
    ├── stt.ts                 # STT providers (local Qwen3, whisper.cpp, OpenAI Whisper)
    ├── tts.ts                 # TTS providers (local Kokoro, OpenAI TTS)
    ├── listener.ts            # STT provider wrapper (thin alias)
    ├── speaker.ts             # TTS provider wrapper (thin alias)
    └── split.ts               # Response chunking at sentence boundaries
scripts/
├── listen_stream.sh           # Recording + local ASR (Qwen3 / Whisper.cpp)
└── say.sh                     # Local TTS synthesis (Kokoro + rubberband)
```

## Provider adapter guide

Adding a new provider for any layer requires:
1. Create a class implementing the interface (`LlmProvider`, `SttProvider`, or `TtsProvider`)
2. Add the env var to `config.ts`
3. Register it in the factory function (the `switch` statement)
4. Add an option entry in `src/lib/runtime-config.ts` with a provider alias for voice switching

Interfaces are minimal:

```typescript
interface LlmProvider { name: string; complete(prompt: string): Promise<string>; }
interface SttProvider { name: string; transcribe(): Promise<string>; }
interface TtsProvider { name: string; speak(text: string): Promise<void>; }
```

## Development

```bash
# Type-check
npm run typecheck

# Build
npm run build

# Run with local debugging output
npm start -- --silent
```

## Legacy

The original Python prototype is kept at `shodan_agent.py` for reference.
