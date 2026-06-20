#!/bin/bash
# say.sh - Speak text with Isabella voice (Kokoro) at natural speed
# Usage: ./say.sh "text to speak"

set -euo pipefail

TEXT="${1:?Usage: say.sh <text>}"
OUTPUT="${2:-/tmp/shodan_speech.wav}"

speech kokoro "$TEXT" --voice bf_isabella --output "$OUTPUT" 2>/dev/null
afplay "$OUTPUT"
