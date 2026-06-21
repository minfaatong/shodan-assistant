#!/bin/bash
# say.sh - Synthesize speech with Kokoro TTS
# Usage: ./say.sh "text to speak" [output.wav]
# Output defaults to /tmp/shodan_speech.wav if not provided

set -euo pipefail

TEXT="${1:?Usage: say.sh <text> [output]}"
OUTPUT="${2:-/tmp/shodan_speech.wav}"

speech kokoro "$TEXT" --voice bf_isabella --output "$OUTPUT" 2>/dev/null
