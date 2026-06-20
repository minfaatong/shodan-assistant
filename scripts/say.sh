#!/bin/bash
# say.sh - Speak text with Isabella voice (Kokoro) at 70% speed
# Usage: ./say.sh "text to speak"

set -euo pipefail

TEXT="${1:?Usage: say.sh <text>}"
OUTPUT="${2:-/tmp/isabella_speech.wav}"

speech kokoro "$TEXT" --voice bf_isabella --output "$OUTPUT" 2>/dev/null
ffmpeg -y -i "$OUTPUT" -filter:a "rubberband=tempo=0.7,aresample=24000" "${OUTPUT%.wav}_slow.wav" 2>/dev/null
afplay "${OUTPUT%.wav}_slow.wav"
