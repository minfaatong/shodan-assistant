# AGENTS.md — shodan-assistant

## What it does

A voice-only AI assistant that runs locally on your Mac.
Listens → thinks (local LLM via llama.cpp) → speaks back.
Always initiates each conversation turn — never passively waits.

## Architecture

```
┌─ Listener ──────────────────────────────────────────┐
│  Continuous: listen_stream.sh (Qwen3-ASR)            │
│  1× beep at start of recording, 1× beep at end       │
│  Speech detected → transcript → Agent loop            │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ Agent Loop (async) ─────────────────────────────────┐
│  listenOnce() → queryLlm() → speakChunked()           │
│  Re-greets every ~20s when idle                      │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ Speaker ───────────────────────────────────────────┐
│  1× beep before speaking                            │
│  quick clip (pre-recorded) → TTS (say.sh/Kokoro)    │
│  Chunks with silence gaps between them              │
└──────────────────────────────────────────────────────┘
```

## Terminal UI (ink/React)

The agent runs inside an interactive terminal UI built with `ink` (React for CLIs).

| Element | Description |
|---------|-------------|
| Status bar | Current state (Listening/Thinking/Speaking) with spinner |
| Chat log | Persistent conversation (static, appended per message) |
| Log line | Last log entry at the bottom |

### Controls
- `q` or `Ctrl+C` — quit

## Components

| Component | Local | Cloud alternatives |
|-----------|-------|-------------------|
| **LLM** | llama.cpp (`Qwen3-8B-Q8_0.gguf`) | OpenRouter, Ollama, OpenAI |
| **STT** | listen_stream.sh (Qwen3-ASR), whisper.cpp | OpenAI Whisper |
| **TTS** | say.sh (Kokoro bf_isabella, 70%) | OpenAI TTS |
| **Beeps** | Auto-generated WAVs `/tmp/beep_start.wav`, `/tmp/beep_end.wav` | — |
| **Quick clips** | `/tmp/shodan_quick/*.wav` (8 pre-recorded at 70%) | — |
| **Terminal UI** | ink + React 18 | — |

## Key files

- `src/index.tsx` — entry point (tsx)
- `src/app.tsx` — main App component with state
- `src/lib/agent.ts` — async agent loop
- `src/lib/listener.ts` — ASR wrapper
- `src/lib/speaker.ts` — TTS + quick clips + chunking
- `src/lib/llm.ts` — LLM API client
- `src/lib/beeps.ts` — beep generation and playback
- `src/lib/config.ts` — paths and defaults
- `src/lib/runtime-config.ts` — runtime provider/model switching (voice-activated)
- `src/lib/split.ts` — response chunking
- `src/components/status-bar.tsx` — status indicator
- `src/components/chat.tsx` — conversation display
- `src/components/log-panel.tsx` — log line
- `scripts/listen_stream.sh` — STT/recording loop
- `scripts/say.sh` — TTS synthesis
- `shodan_agent.py` — (legacy Python version, kept for reference)

## Usage

```bash
npm start                         # defaults
npm start -- --intro "Hello..."   # custom greeting
npm start -- --gap 1.0            # gap between chunks
npm start -- --silent             # log only, no TTS
npm start -- --no-warmup          # skip warmup
```

## Provider configuration

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

### Recognized providers

| Category | Recognized names |
|----------|------------------|
| LLM | llama.cpp, OpenRouter, Ollama, OpenAI |
| STT | Qwen3-ASR (local), whisper.cpp, OpenAI Whisper |
| TTS | Kokoro (local), OpenAI TTS |

### Recognized models

| Provider | Models |
|----------|--------|
| OpenRouter | Claude Sonnet 4, GPT-4o, GPT-4o mini, DeepSeek V3, Gemini 2.0 Flash, Qwen 2.5 72B, Llama 3.3 70B |
| Ollama | Llama 3.2, Qwen3, Mistral, Phi-4, DeepSeek R1 |
| OpenAI LLM | GPT-4o, GPT-4o mini, GPT-4.1 |
| whisper.cpp | Tiny, Small, Medium, Large |
| OpenAI TTS | Alloy, Echo, Fable, Onyx, Nova, Shimmer |

## Runtime requirements

- Node.js 22+ with npm
- **Local LLM**: llama.cpp server at `http://127.0.0.1:8080` with `Qwen3-8B-Q8_0.gguf`
- **Local STT**: `speech` CLI (Qwen3-ASR)
- **Local TTS**: `speech` CLI (Kokoro)
- **Cloud providers**: API keys for OpenRouter / OpenAI as needed
- `ffmpeg` (rubberband audio filter + aresample)
- `SwitchAudioSource` (macOS mic selection)
- `afplay` (macOS audio playback)
- `rec` (SoX — recording with silence detection)

## Canonical source of truth

The canonical project lives in `~/Documents/dev/projs/shodan-assistant/`. The skill registry copy at `~/.qclaw/skills/shodan-assistant/` is kept in sync (mirror, not symlink). **Edit files here, then mirror to the skill folder.** Both copies should have identical content for `src/`, `scripts/`, `package.json`, and `tsconfig.json`.

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--intro TEXT` | (greeting list) | Override startup greeting |
| `--gap SECONDS` | 1.2 | Silence between response chunks |
| `--silent` | false | Log only, no TTS output |
| `--no-warmup` | false | Skip ASR/TTS warmup |
| `-h, --help` | | Show help |

## Bug log

- 2026-06-14: `_log()` TypeError — `flush=True` passed both positionally and in `**kw`. Fixed.
- 2026-06-14: Speaker started before warmup completed — spoke too early. Fixed with `startup_done` event gate.
- 2026-06-14: TTS tempo 80% too fast — slowed to 75% (`atempo=0.75`).
- 2026-06-14: `listen_stream.sh --warmup` hung in subprocess. Fixed arg parser.
- 2026-06-14: LLM call returned HTTP Error 404. Fixed endpoint to `/v1/completions`.
- 2026-06-20: Triple end-beep: `listen_stream.sh` played BEEP_END once, Python played it twice more. Removed Python `beep_end()` call.
- 2026-06-20: Orphaned `_slow.wav` temp files accumulating in `/tmp/`. Fixed cleanup.
- 2026-06-20: High-pitch/glitchy voice from `atempo` phase vocoder artifacts. Replaced with rubberband filter at 70% tempo.
- 2026-06-20: `echo "⏳ Transcribing..."` leaked to stdout, corrupting transcript sent to LLM. Moved to stderr.
- 2026-06-20: Beep files missing, model name mismatch, no visual listening indicator. Fixed in migration to ink TUI.
