#!/bin/bash
# say.sh - Synthesize speech with Kokoro TTS (macOS speech CLI)
# Usage: ./say.sh "text to speak" [output.wav]
# Voice: KOKORO_VOICE env var (default: bf_isabella)

set -euo pipefail

TEXT="${1:?Usage: say.sh <text> [output]}"
OUTPUT="${2:-/tmp/shodan_speech.wav}"
VOICE="${KOKORO_VOICE:-bf_isabella}"

speech kokoro "$TEXT" --voice "$VOICE" --output "$OUTPUT" 2>/dev/null
