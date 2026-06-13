#!/bin/bash
# listen_stream.sh - Continuous voice input with silence detection
# Records until 2s of silence, then transcribes
# Usage: ./listen_stream.sh [engine|--warmup] [engine]
#   engine: qwen3 (default) | whisper | parakeet | nemotron | omnilingual
#   --warmup: preload ASR model without recording, exits immediately
#
# Beeps: short high tone (⬆) before recording, low double tone (⬇) after

set -euo pipefail

WARMUP=false
ENGINE="qwen3"

# Parse args — --warmup may appear in any position
for arg in "$@"; do
    case "$arg" in
        --warmup) WARMUP=true ;;
        qwen3|whisper|parakeet|nemotron|omnilingual) ENGINE="$arg" ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

OUTPUT="/tmp/stt_stream.wav"
BEEP_START="/tmp/beep_start.wav"
BEEP_END="/tmp/beep_end.wav"

if $WARMUP; then
    # Warmup only — preload ASR model without recording
    # Use a tiny in-memory WAV to actually load the model
    speech transcribe "$BEEP_START" 2>/dev/null || true
    exit 0
fi

# Beep → recording starts
afplay "$BEEP_START" 2>/dev/null || true

rec -q -c 1 -b 16 "$OUTPUT" silence 1 0.3 3% 1 2.0 3% 2>/dev/null

# Beep → recording stopped
afplay "$BEEP_END" 2>/dev/null || true

echo "⏳ Transcribing (engine: $ENGINE)..."

case "$ENGINE" in
  whisper)
    whisper-cli -m "$HOME/.cache/whisper-cpp/ggml-small.bin" -f "$OUTPUT" -otxt 2>/dev/null
    RESULT=$(tail -1 "${OUTPUT}.txt" 2>/dev/null)
    ;;
  qwen3|parakeet|nemotron|omnilingual)
    RESULT=$(speech transcribe "$OUTPUT" --engine "$ENGINE" 2>/dev/null)
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