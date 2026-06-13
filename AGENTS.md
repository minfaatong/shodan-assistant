# AGENTS.md — shodan-assistant

## What it does

A voice-only AI assistant that runs locally on your Mac.
Listens → thinks (local LLM via llama.cpp) → speaks back.
Always initiates each conversation turn — never passively waits.

## Architecture

```
┌─ Listener Thread ─────────────────────────────────────────┐
│  Continuous: listen_stream.sh (Qwen3-ASR)               │
│  1× beep at start of recording, 2× beep at end            │
│  Speech detected → request_queue.put(transcript)          │
└────────────────────────────────────────────────────────────┘
                              │
                    request_queue
                              ▼
┌─ Main Thread ────────────────────────────────────────────┐
│  request_queue.get() → query_llm() → response_queue.put()│
└────────────────────────────────────────────────────────────┘
                              │
                    response_queue
                              ▼
┌─ Speaker Thread ─────────────────────────────────────────┐
│  1× beep before speaking                                │
│  quick clip (pre-recorded) → TTS (say.sh/Kokoro)        │
│  Chunks with silence gaps between them                  │
└────────────────────────────────────────────────────────────┘
```

## Key design decisions

### Always speaks first
Assistant greets immediately on startup (after warmup). When idle, re-greets every ~20s. User never has to initiate.

### Instant common responses
Short filler phrases ("Okay.", "I'm here.", "Sorry?") are pre-recorded as WAV clips (`/tmp/shodan_quick/`) and played via `afplay` with zero TTS lag (~0ms vs 15-30s synthesis). Falls back to `say.sh` for anything not in the quick list.

### Response chunking
LLM responses longer than ~200 chars are split at sentence boundaries and spoken as separate chunks with configurable silence gaps between them. Prevents long monologue; feels more natural.

### Startup gate
Speaker thread waits for `startup_done` event before accepting from the queue. This ensures warmup completes and the greeting is already queued when the speaker first wakes up — no premature talking.

## Components

| Component | Tool | Notes |
|-----------|------|-------|
| ASR | `listen_stream.sh` (Qwen3-ASR) | Silence-detecting recorder |
| TTS | `say.sh` (Kokoro bf_isabella, 75%) | Speed controlled via `atempo=0.75` |
| LLM | llama.cpp `:8080` gemma4-e4b | `/v1/completions` endpoint |
| Beeps | `/tmp/beep_start.wav`, `/tmp/beep_end.wav` | 1× start, 2× end |
| Quick clips | `/tmp/shodan_quick/*.wav` | 8 pre-recorded clips at 75% |

## Key files

- `shodan_agent.py` — main agent (3-thread, queue-based)
- `scripts/listen_stream.sh` — STT/recording loop
- `scripts/say.sh` — TTS synthesis

## Runtime requirements

- llama.cpp server running at `http://0.0.0.0:8080/api/v1` with model `gemma4-e4b`
- `speech` CLI (Qwen3-TTS/ASR via Kokoro)
- `ffmpeg` (atempo speed adjustment)
- `SwitchAudioSource` (macOS mic selection — auto-switches to built-in mic before recording)
- `afplay` (macOS audio playback)

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--intro TEXT` | (greeting list) | Override startup greeting |
| `--gap SECONDS` | 1.2 | Silence between response chunks |
| `--silent` | false | Log only, no TTS output |
| `--no-warmup` | false | Skip ASR/TTS warmup |

## Bug log

- 2026-06-14: `_log()` TypeError — `flush=True` passed both positionally and in `**kw`. Fixed.
- 2026-06-14: Speaker started before warmup completed — spoke too early. Fixed with `startup_done` event gate.
- 2026-06-14: TTS tempo 80% too fast — slowed to 75% (`atempo=0.75`).