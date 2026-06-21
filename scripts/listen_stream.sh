#!/bin/bash
# listen_stream.sh - Continuous voice input with silence detection
# Records until 2s of silence, then transcribes
# Usage: ./listen_stream.sh [engine|--warmup] [engine]
#   engine: qwen3 (default) | whisper | parakeet | nemotron | omnilingual
#   --warmup: preload ASR model without recording, exits immediately
#
# Beeps: short high tone (⬆) before recording, low double tone (⬇) after

set -euo pipefail

# ── Detect platform audio player ──────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  PLAYER="afplay"
elif which aplay &>/dev/null; then
  PLAYER="aplay"
elif which paplay &>/dev/null; then
  PLAYER="paplay"
else
  PLAYER="ffplay"
fi

# ── Detect recording tool ─────────────────────────────────────────
if which rec &>/dev/null; then
  REC_CMD="rec"
elif which arecord &>/dev/null; then
  REC_CMD="arecord"
else
  REC_CMD="rec"  # hope it's in PATH
fi

# ── Detect whether speech CLI is available (macOS local) ──────────
SPEECH_AVAILABLE=false
which speech &>/dev/null && SPEECH_AVAILABLE=true

# ── Config ─────────────────────────────────────────────────────────
WARMUP=false
RECORD_ONLY=false
ENGINE="qwen3"

# Parse args — flags may appear in any position
for arg in "$@"; do
    case "$arg" in
        --warmup) WARMUP=true ;;
        --record-only) RECORD_ONLY=true ;;
        qwen3|whisper|parakeet|nemotron|omnilingual) ENGINE="$arg" ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

OUTPUT="/tmp/stt_stream.wav"
BEEP_START="/tmp/beep_start.wav"
BEEP_END="/tmp/beep_end.wav"

if $WARMUP; then
    # Warmup only — preload ASR model without recording
    if $SPEECH_AVAILABLE; then
      speech transcribe "$BEEP_START" 2>/dev/null || true
    fi
    exit 0
fi

# Beep → recording starts
"$PLAYER" "$BEEP_START" 2>/dev/null || true

if [ "$REC_CMD" = "arecord" ]; then
  arecord -q -c 1 -r 16000 -f S16_LE -d 5 "$OUTPUT" 2>/dev/null
else
  rec -q -c 1 -b 16 "$OUTPUT" silence 1 0.3 3% 1 2.0 3% 2>/dev/null
fi

# Beep → recording stopped
"$PLAYER" "$BEEP_END" 2>/dev/null || true

if $RECORD_ONLY; then
    echo "$OUTPUT"
    exit 0
fi

echo "⏳ Transcribing (engine: $ENGINE)..." >&2

case "$ENGINE" in
  whisper)
    whisper-cli -m "$HOME/.cache/whisper-cpp/ggml-small.bin" -f "$OUTPUT" -otxt 2>/dev/null
    RESULT=$(tail -1 "${OUTPUT}.txt" 2>/dev/null)
    ;;
  qwen3|parakeet|nemotron|omnilingual)
    if $SPEECH_AVAILABLE; then
      RESULT=$(speech transcribe "$OUTPUT" --engine "$ENGINE" 2>/dev/null | sed -n 's/^Result: //p') || true
    else
      # Fallback to whisper when speech CLI is unavailable (Linux)
      whisper-cli -m "$HOME/.cache/whisper-cpp/ggml-small.bin" -f "$OUTPUT" -otxt 2>/dev/null
      RESULT=$(tail -1 "${OUTPUT}.txt" 2>/dev/null)
    fi
    ;;
  *)
    echo "Unknown engine: $ENGINE (use: qwen3, whisper, parakeet, nemotron, omnilingual)"
    exit 1
    ;;
esac

if [ -z "$RESULT" ]; then
    echo "(no speech detected)"
else
    echo "$RESULT"
fi