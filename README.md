# Shodan Assistant

A voice-only AI assistant that runs on macOS, Linux, and Windows WSL. Listens, thinks (via local or cloud LLM), and speaks back. Always initiates each conversation turn — never passively waits.

*This is a fan project and is not affiliated with or endorsed by Nightdive Studios. SHODAN is a trademark of Nightdive Studios.*

Built with TypeScript + [ink](https://github.com/vadimdemedes/ink) (React for CLIs) for a full-screen terminal UI with portrait animation, conversation log, status indicators, and a persistent text input bar.

```
┌──────────────────────────────────────────────────────┐
│ 🎤 Listening — LLM:llama.cpp STT:local TTS:local     │  ← Status bar
├──────────────────────────────────────────────────────┤
│ ┌──────┐  You: what's the weather?                    │
│ │      │  Shodan: I'm not connected to weather...     │
│ │SHODAN│                                               │
│ │      │  You: tell me a joke                          │
│ │  ☺   │  Shodan: Why did the...                      │
│ └──────┘                                               │
├──────────────────────────────────────────────────────┤
│ > █                                                   │  ← Text input
└──────────────────────────────────────────────────────┘
```

## Architecture

Three independent layers connected by a central agent loop:

```
┌─ STT (Speech-to-Text) ───────────────────────────────┐
│  Local (macOS): listen_stream.sh → Qwen3-ASR (speech)  │
│  Local (Linux):  arecord/rec → whisper.cpp            │
│  Cloud:         rec/arecord → OpenAI / Google API     │
│  1× beep at start, 1× beep at end                    │
│  Speech detected → transcript → Agent loop            │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ Agent Loop (async) ─────────────────────────────────┐
│  listenOnce() → queryLlm() → speakChunked()           │
│  Re-greets after 30s idle                            │
│  Barge-in: voice input during speech cancels TTS     │
│  Text input: /commands or plain text → agent         │
│  File logging: ./logs/shodan_log.log                 │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ TTS (Text-to-Speech) ───────────────────────────────┐
│  1× beep before speaking                             │
│  Local (macOS): Kokoro via speech CLI                │
│  Local (Linux):  Kokoro via Python pip (kokoro-tts)  │
│  Cloud:         OpenAI TTS / Google TTS API          │
│  Full response sent in one call (no chunking)        │
└──────────────────────────────────────────────────────┘
```

### Why TypeScript over Python?
The original prototype was a Python script (`shodan_agent.py`). The TypeScript rewrite was done to support ink (React for CLIs) for a rich terminal UI with spinners, persistent chat logs, and real-time status updates. Node.js `child_process` handles shell script integration, and `fetch` (built-in since Node 18) handles all LLM/cloud API calls without extra dependencies.

### Why provider pattern?
LLMs, STT, and TTS are interchangeable layers behind a common interface (`LlmProvider`, `SttProvider`, `TtsProvider`). This lets you mix and match:

- Use a fast local STT for privacy-sensitive queries
- Route the LLM to a cloud model (Claude, GPT-4o, DeepSeek) for complex tasks
- Fall back to local TTS when offline

Each provider is a class with a `name` and a single method (`complete()`, `transcribe()`, `speak()`). The factory returns the active instance based on environment variables or runtime config.

### Why separate shell scripts for STT/TTS?
`listen_stream.sh` and `say.sh` handle platform-specific audio capture (SoX rec / arecord, afplay / aplay) and ML model management (`speech` CLI on macOS, `kokoro-tts` pip package on Linux). The TypeScript layer is platform-agnostic — it detects the OS at runtime and dispatches to the right provider. Cloud providers bypass the transcription/synthesis steps but still use the same recording/playback infrastructure.

### Why ink over other TUI frameworks?
Ink provides React components (`Box`, `Text`) with Yoga layout, making it straightforward to build a terminal UI. `useInput` handles keyboard shortcuts, and React state drives the full layout including portrait animation, scrollable chat, and overlay menus for provider/model selection.

## Prerequisites

### Quick install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/minfaatong/shodan-assistant/main/scripts/install.sh)
```

Or after cloning the repo:

```bash
bash scripts/install.sh
```

The installer detects your OS and installs all required and recommended dependencies.

### By OS

| Dependency | macOS | Linux (Debian/Ubuntu) | Linux (Arch) | WSL |
|------------|-------|----------------------|-------------|-----|
| **Node.js ≥22** | `brew install node` | [nodejs.org](https://nodejs.org) or `apt install nodejs` | `pacman -S nodejs` | Same as Linux |
| **SoX** (rec) | `brew install sox` | `apt install sox` | `pacman -S sox` | `apt install sox` |
| **Audio player** | Built-in `afplay` | `apt install alsa-utils` (aplay) | `pacman -S alsa-utils` | Same as Linux |
| **ffmpeg** | `brew install ffmpeg` | `apt install ffmpeg` | `pacman -S ffmpeg` | Same as Linux |
| **Python 3 + pip** | `brew install python` | `apt install python3-pip` | `pacman -S python-pip` | Same as Linux |
| **whisper.cpp** | `brew install cmake` + build | `apt install cmake build-essential` + build | `pacman -S cmake base-devel` + build | Same as Linux |
| **Mic selection** | `brew install switchaudio-osx` | N/A (`arecord` auto-detects) | N/A | N/A |

### Local STT

| Method | Install | Platform |
|--------|---------|----------|
| **speech CLI** (Qwen3-ASR) | `brew install speech` | macOS only |
| **whisper.cpp** | See [install.sh](scripts/install.sh) or build from source | All platforms |

### Local TTS

| Method | Install | Platform |
|--------|---------|----------|
| **speech CLI** (Kokoro) | `brew install speech` | macOS only |
| **kokoro-tts** (Python) | `pip install kokoro-tts` + [download model](https://huggingface.co/kokoro-tts/kokoro) | All platforms |

### Local LLM (choose one)

**llama.cpp** (recommended for fully offline):

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build
cmake --build build --config Release
# Download a model (e.g. Qwen3-8B-Q8_0.gguf from HuggingFace)
./build/bin/server -m /path/to/Qwen3-8B-Q8_0.gguf --host 127.0.0.1 --port 8080
```

**Ollama** (simpler setup):

```bash
brew install ollama
ollama pull llama3.2      # or qwen3, gemma4:31b-cloud, etc.
ollama serve
```

### Local STT (choose one)

**Qwen3-ASR** (default, via `speech` CLI):

```bash
brew install speech
# or build from source: https://github.com/nicedoc/speech
```

**whisper.cpp** (alternative offline STT):

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
bash ./models/download-ggml-model.sh small
make
# Provide the model path via WHISPER_MODEL_PATH env var
```

### Local TTS

**Kokoro** (via `speech` CLI — same binary as Qwen3-ASR):

```bash
brew install speech
```

### Cloud providers (optional)

| Service | Sign up | Required env var |
|---------|---------|-----------------|
| OpenRouter | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |
| OpenAI | https://platform.openai.com/api-keys | `OPENAI_API_KEY` |
| Cloudflare Workers AI | https://dash.cloudflare.com/ | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` |
| DeepSeek | https://platform.deepseek.com/ | `DEEPSEEK_API_KEY` |
| Google Cloud STT/TTS | https://console.cloud.google.com/ | `GOOGLE_API_KEY` |

## Installation

### Quick install (recommended)

```bash
npm install -g shodan-assistant
```

This installs the `shodan` command globally. After setting up prerequisites (see below), run:

```bash
shodan
```

### From source

```bash
git clone https://github.com/minfaatong/shodan-assistant
cd shodan-assistant
npm install
npm run build
```

Then run with:

```bash
# Via the global bin (links local package)
npm link && shodan

# Or directly with tsx during development
npm start
```

## Quick start

```bash
# Make sure prerequisites are set up first (LLM server, STT/TTS tools)
shodan

# Quiet mode — log only, no spoken output
shodan --silent
```

## Configuration

All providers are configured via environment variables. Local defaults apply when nothing is set.

### LLM providers

| Env var | Default | Options |
|---------|---------|---------|
| `LLM_PROVIDER` | `llama` | `llama` \| `openrouter` \| `ollama` \| `openai` \| `cloudflare` \| `deepseek` |
| `LLAMA_BASE` | `http://127.0.0.1:8080/v1` | any llama.cpp endpoint |
| `LLAMA_MODEL` | `Qwen3-8B-Q8_0.gguf` | model loaded on server |
| `OPENROUTER_API_KEY` | — | your OpenRouter API key |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4-20250514` | any OpenRouter model ID |
| `OLLAMA_BASE` | `http://127.0.0.1:11434/v1` | any Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | any Ollama model |
| `OPENAI_API_KEY` | — | required for `openai` LLM provider |
| `CLOUDFLARE_API_KEY` | — | required for `cloudflare` LLM provider |
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account ID |
| `CLOUDFLARE_MODEL` | `@cf/zai-org/glm-5.2` | any Cloudflare Workers AI model |
| `DEEPSEEK_API_KEY` | — | required for `deepseek` LLM provider |
| `DEEPSEEK_BASE` | `https://api.deepseek.com` | DeepSeek API base URL |

### STT providers

| Env var | Default | Options |
|---------|---------|---------|
| `STT_PROVIDER` | `local` | `local` \| `whispercpp` \| `openai` \| `google` |
| `WHISPER_MODEL` | `small` | `tiny` \| `small` \| `medium` \| `large` |
| `WHISPER_MODEL_PATH` | (auto) | explicit path to `ggml-*.bin` model file |
| `WHISPER_LANG` | `en` | language code for whisper.cpp |
| `GOOGLE_API_KEY` | — | required for `google` provider |

### TTS providers

| Env var | Default | Options |
|---------|---------|---------|
| `TTS_PROVIDER` | `local` | `local` \| `openai` \| `google` |
| `OPENAI_API_KEY` | — | required for `openai` provider |
| `OPENAI_TTS_VOICE` | `alloy` | `alloy` \| `echo` \| `fable` \| `onyx` \| `nova` \| `shimmer` |
| `GOOGLE_API_KEY` | — | required for `google` provider |

Google TTS voices (set via runtime `/key` menu or `applySwitch`): `Neural2-D` (male), `Neural2-F` (female), `Studio-Q` (male), `Studio-O` (female), `Journey-D` (male), `Journey-F` (female).

### Examples

```bash
# Default: all local (requires llama.cpp + speech CLI)
shodan

# OpenRouter for smarter LLM, everything else local
OPENROUTER_API_KEY=sk-or-... LLM_PROVIDER=openrouter shodan

# OpenAI for everything
LLM_PROVIDER=openai STT_PROVIDER=openai TTS_PROVIDER=openai \
OPENAI_API_KEY=sk-... shodan

# Ollama as LLM backend
LLM_PROVIDER=ollama OLLAMA_MODEL=llama3.2 shodan

# whisper.cpp as STT (offline, different model from Qwen3)
STT_PROVIDER=whispercpp shodan

# whisper.cpp with specific model & custom path
STT_PROVIDER=whispercpp WHISPER_MODEL=medium WHISPER_MODEL_PATH=/path/to/ggml-medium.bin shodan

# Cloudflare Workers AI as LLM
CLOUDFLARE_API_KEY=... CLOUDFLARE_ACCOUNT_ID=... LLM_PROVIDER=cloudflare shodan

# DeepSeek as LLM
DEEPSEEK_API_KEY=... LLM_PROVIDER=deepseek shodan

# Google STT and/or TTS
GOOGLE_API_KEY=... STT_PROVIDER=google TTS_PROVIDER=google shodan
```

All examples also work with `npm start` when developing from a local clone.
```

## Text commands

Type `/` to enter command mode. Commands fire independently of the voice agent loop.

| Command | Description |
|---------|-------------|
| `/help` | Show help text |
| `/provider` | Switch LLM / STT / TTS provider |
| `/llm` | Switch LLM provider or model |
| `/stt` | Switch STT provider |
| `/tts` | Switch TTS provider |
| `/model` | Switch model for current LLM provider |
| `/key <api_key>` | Set API key for current provider |
| `/profile` | Save, load, or delete profiles |
| `/default` | Reset all settings to defaults |
| `/quit` | Exit the application |

Commands show an interactive selection list for provider/model choices.

## TUI controls

| Key | Action |
|-----|--------|
| `Ctrl+C` | Quit |
| `↑`/`↓` (idle) | Scroll chat history |
| `/` | Enter command mode |
| `Esc` (command/menu) | Cancel, return to idle |
| `⏎` (menu) | Select highlighted item |

## Runtime switching (voice)

Providers and models can be changed mid-session by voice. Say any of:

- `"switch LLM to OpenAI"`
- `"use OpenRouter for thinking"`
- `"set TTS to local"`
- `"change STT to whisper"`
- `"switch model to claude"` (changes model within current LLM provider)

### Recognized providers

| Category | Recognized names |
|----------|------------------|
| LLM | llama.cpp, OpenRouter, Ollama, OpenAI, Cloudflare, DeepSeek |
| STT | Qwen3-ASR (local), whisper.cpp, OpenAI Whisper, Google STT |
| TTS | Kokoro (local), OpenAI TTS, Google TTS |

### Recognized models

| Provider | Models |
|----------|--------|
| OpenRouter | DeepSeek V4 Flash, Claude Sonnet 4, GPT-4o, GPT-4o mini, DeepSeek V3, Gemini 2.0 Flash, Qwen 2.5 72B, Llama 3.3 70B |
| Ollama | Gemma 4 31B, Llama 3.2, Qwen3, Mistral, Phi-4, DeepSeek R1 |
| OpenAI LLM | GPT-4o, GPT-4o mini, GPT-4.1 |
| Cloudflare | GLM 5.2 |
| DeepSeek | DeepSeek V4 Flash, DeepSeek V4 Pro, DeepSeek Chat, DeepSeek Reasoner |
| whisper.cpp | Tiny, Small, Medium, Large |
| OpenAI TTS | Alloy, Echo, Fable, Onyx, Nova, Shimmer |
| Google TTS | Neural2 D (male), Neural2 F (female), Studio Q (male), Studio O (female), Journey D (male), Journey F (female) |

Voice switching updates the provider and model dynamically — no restart needed. The status bar reflects changes immediately.

## Profile system

Profiles persist runtime provider/model selections across sessions.

```bash
# Save current configuration as a named profile
/profile → Save current as profile → (enter name)

# Load a previously saved profile
/profile → Load a profile → (select profile)

# Set a profile to auto-load on startup
/profile → Set default profile → (select profile)

# Delete a profile
/profile → Delete a profile → (select profile)

# Reset everything to env-var defaults
/default
```

Profiles are stored at `~/.config/shodan-assistant/profiles.json`. The auto-load profile is tracked in `~/.config/shodan-assistant/default_profile`.

## File logging

All agent activity is logged to `./logs/shodan_log.log` with ISO timestamps:

- Agent start and shutdown
- User input (text and voice transcripts)
- LLM responses
- Provider/model switches
- Errors with full stack traces

Logs are appended — no rotation. The `logs/` directory is git-ignored.

## CLI flags

```bash
shodan [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--intro TEXT` | (greeting list) | Override startup greeting |
| `--gap SECONDS` | 1.2 | Silence between response chunks |
| `--silent` | false | Log only, no TTS output |
| `--no-warmup` | false | Skip ASR/TTS warmup |
| `-h, --help` | | Show help |

## File structure

```
src/
├── index.tsx                  # Entry point (parses CLI args, renders <App>)
├── app.tsx                    # State machine, keyboard input, layout
├── components/
│   ├── status-bar.tsx         # Animated spinner + current state + provider label
│   ├── chat.tsx               # Persistent conversation display with scroll
│   ├── portrait.tsx           # SHODAN ASCII art with mouth animation
│   ├── command-input.tsx      # Persistent text input bar at bottom
│   └── command-menu.tsx       # Selectable provider/model list
└── lib/
    ├── agent.ts               # Async agent loop (orchestrates LLM/STT/TTS)
    ├── runtime-config.ts      # Runtime provider/model switching
    ├── config.ts              # Environment variable bindings
    ├── types.ts               # Shared types (Status, Message, AgentState)
    ├── commands.ts            # Slash command parser + menu builders
    ├── profiles.ts            # Save/load/list/delete profiles
    ├── beeps.ts               # WAV generation + afplay helper
    ├── llm.ts                 # LLM providers (llama.cpp, OpenRouter, Ollama, OpenAI, Cloudflare, DeepSeek)
    ├── stt.ts                 # STT providers (local Qwen3, whisper.cpp, OpenAI Whisper, Google STT)
    ├── tts.ts                 # TTS providers (local Kokoro, OpenAI TTS, Google TTS)
    ├── listener.ts            # STT provider wrapper + abort support
    ├── speaker.ts             # TTS provider wrapper
    ├── logger.ts              # File logger (./logs/shodan_log.log)
    └── split.ts               # Response chunking at sentence boundaries
scripts/
├── listen_stream.sh           # Recording + local ASR (Qwen3 / Whisper.cpp)
└── say.sh                     # Local TTS synthesis (Kokoro at natural speed)
```

## Provider adapter guide

Adding a new provider for any layer requires:
1. Create a class implementing the interface (`LlmProvider`, `SttProvider`, or `TtsProvider`)
2. Add the env var to `config.ts`
3. Register it in the factory function (the `switch` statement)
4. Add an option entry in `src/lib/runtime-config.ts` with a provider alias for voice switching

Interfaces are minimal:

```typescript
interface LlmProvider { name: string; complete(prompt: string, signal?: AbortSignal): Promise<string>; }
interface SttProvider { name: string; transcribe(signal?: AbortSignal): Promise<string>; }
interface TtsProvider { name: string; speak(text: string, signal?: AbortSignal): Promise<void>; }
```

## Development

```bash
# Type-check
npm run typecheck

# Build (compiles src/ → dist/)
npm run build

# Run with local debugging output (no TTS)
npm start -- --silent
# or:
shodan --silent
```

## Legacy

The original Python prototype is kept at `shodan_agent.py` for reference.
