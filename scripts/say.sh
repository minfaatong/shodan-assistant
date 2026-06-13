#!/bin/bash
# say.sh - Speak text with Isabella voice (Kokoro) at 80% speed
# Usage: ./say.sh "text to speak"

set -euo pipefail

TEXT="${1:?Usage: say.sh <text>}"
OUTPUT="${2:-/tmp/isabella_speech.wav}"

speech kokoro "$TEXT" --voice bf_isabella --output "$OUTPUT" 2>/dev/null
ffmpeg -y -i "$OUTPUT" -filter:a "atempo=0.75" "${OUTPUT%.wav}_slow.wav" 2>/dev/null
afplay "${OUTPUT%.wav}_slow.wav"
