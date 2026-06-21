#!/bin/bash
# shodan-assistant — cross-platform dependency installer
# Detects OS, installs required packages (sox, ffmpeg, Python,
# kokoro-tts, whisper.cpp), and downloads Kokoro TTS models.
#
# Works standalone — Node.js is optional (only needed to run
# the app itself, not for installing dependencies).
#
# One-liner: curl -fsSL https://raw.githubusercontent.com/minfaatong/\
#   shodan-assistant/main/scripts/install.sh | bash
#
# Flags:
#   --no-beeps   Skip beep WAV generation (for headless/containers)
#   --no-build   Skip whisper.cpp build (if already installed)
#   --help       Show this message

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }
cmd()   { echo -e "  ${GREEN}→${NC} $1"; "$@"; }

# ── Parse flags ───────────────────────────────────────────────────
NO_BEEPS=false
NO_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --no-beeps) NO_BEEPS=true ;;
    --no-build) NO_BUILD=true ;;
    --help)     sed -n '/^#/p; /^$/q' "$0" | sed 's/^# //; s/^#$//'; exit 0 ;;
    *)          warn "Unknown flag: $arg";;
  esac
done

# ── OS detection ──────────────────────────────────────────────────
OS="unknown"
case "$(uname -s)" in
  Darwin*) OS="macos"  ;;
  Linux*)  OS="linux"  ;;
  CYGWIN*|MINGW*|MSYS*) OS="wsl" ;;
esac

# ── Check Node.js availability (optional) ────────────────────────
check_node_optional() {
  if ! which node &>/dev/null; then
    warn "Node.js not found — install later to run shodan-assistant"
    return
  fi
  local v
  v=$(node -e 'process.stdout.write(process.versions.node)')
  local major
  major=$(echo "$v" | cut -d. -f1)
  if [ "$major" -lt 22 ]; then
    warn "Node.js >= 22 recommended (found v$v). Upgrade or use npx."
  fi
  info "Node.js v$v"
}

# ── macOS (Homebrew) ──────────────────────────────────────────────
install_macos() {
  # Homebrew
  if ! which brew &>/dev/null; then
    cmd /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi

  # Core audio
  cmd brew install sox ffmpeg speech

  # Mic selection
  cmd brew install switchaudio-osx

  # Build tools (whisper.cpp)
  cmd brew install cmake

  # TTS — Kokoro via Python
  install_python_deps

  # whisper.cpp
  install_whisper_cpp

  # Kokoro models
  download_kokoro_models
}

# ── Linux (apt/pacman/dnf) ────────────────────────────────────────
install_linux() {
  local pm=""
  local pkgs_common=""
  if which apt-get &>/dev/null; then
    pm="apt-get"
    pkgs_common="sox alsa-utils ffmpeg python3 python3-pip python3-venv cmake build-essential"
    cmd sudo "$pm" update -qq
    cmd sudo "$pm" install -y -qq $pkgs_common
  elif which pacman &>/dev/null; then
    pm="pacman"
    pkgs_common="sox alsa-utils ffmpeg python python-pip cmake base-devel"
    cmd sudo "$pm" -Syu --noconfirm --quiet $pkgs_common
  elif which dnf &>/dev/null; then
    pm="dnf"
    pkgs_common="sox alsa-utils ffmpeg python3 python3-pip python3-venv cmake gcc gcc-c++ make"
    cmd sudo "$pm" install -y $pkgs_common
  else
    fail "No supported package manager found (apt/pacman/dnf). Install deps manually:\n" \
         "  sox, ffmpeg, python3, python3-pip, cmake, build tools"
  fi

  install_python_deps
  install_whisper_cpp
  download_kokoro_models
}

# ── WSL ────────────────────────────────────────────────────────────
install_wsl() {
  warn "WSL detected. Ensure PulseAudio is configured for audio output."
  warn "See: https://wiki.ubuntu.com/WSL#Audio"
  install_linux
}

# ── Python Kokoro TTS ──────────────────────────────────────────────
install_python_deps() {
  info "Installing Python TTS (kokoro-tts)..."
  if pip3 show kokoro-tts &>/dev/null; then
    info "kokoro-tts already installed"
    return
  fi
  if [ "$OS" = "macos" ]; then
    cmd pip3 install --user kokoro-tts
  else
    cmd pip3 install --user --break-system-packages kokoro-tts 2>/dev/null \
      || cmd pip3 install --user kokoro-tts
  fi
  # Verify
  pip3 show kokoro-tts &>/dev/null || warn "kokoro-tts installation may need manual fix"
}

# ── whisper.cpp ────────────────────────────────────────────────────
install_whisper_cpp() {
  if which whisper-cli &>/dev/null && [ "$NO_BUILD" = true ]; then
    info "whisper-cli already installed"
    return
  fi

  if which whisper-cli &>/dev/null; then
    info "whisper-cli found at $(which whisper-cli)"
    # Still make sure we have a small model
    download_whisper_model
    return
  fi

  local tmp
  tmp=$(mktemp -d)
  warn "Building whisper.cpp from source (this may take a few minutes)..."

  cmd git clone --depth 1 https://github.com/ggerganov/whisper.cpp "$tmp"
  cmd cmake -S "$tmp" -B "$tmp/build" -DCMAKE_BUILD_TYPE=Release
  cmd cmake --build "$tmp/build" -j "$(nproc 2>/dev/null || echo 4)" --target whisper-cli

  # Install to /usr/local/bin
  cmd sudo cp "$tmp/build/bin/whisper-cli" /usr/local/bin/whisper-cli

  rm -rf "$tmp"
  info "whisper-cli installed to /usr/local/bin/whisper-cli"

  download_whisper_model
}

download_whisper_model() {
  local model_size="${WHISPER_MODEL:-small}"
  local model_dir="${HOME}/.cache/whisper-cpp"
  local model_file="${model_dir}/ggml-${model_size}.bin"

  if [ -f "$model_file" ]; then
    info "whisper.cpp model (${model_size}) already cached"
    return
  fi

  warn "Downloading whisper.cpp model (${model_size})..."
  mkdir -p "$model_dir"
  local url="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${model_size}.bin"
  cmd curl -fsSL "$url" -o "$model_file"
  info "Model downloaded to ${model_file}"
}

 # ── Download Kokoro ONNX model ─────────────────────────────────────
download_kokoro_models() {
  local model_dir="${HOME}/.local/share/kokoro"
  local model_file="${model_dir}/kokoro-v1.0.onnx"
  local voices_file="${model_dir}/voices-v1.0.bin"
  local base_url="https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0"

  mkdir -p "$model_dir"

  if [ ! -f "$model_file" ]; then
    warn "Downloading Kokoro ONNX model (90 MB)..."
    cmd curl -fsSL "${base_url}/kokoro-v1.0.onnx" -o "$model_file"
    info "Model downloaded to ${model_file}"
  else
    info "Kokoro ONNX model already cached"
  fi

  if [ ! -f "$voices_file" ]; then
    warn "Downloading Kokoro voices (2 MB)..."
    cmd curl -fsSL "${base_url}/voices-v1.0.bin" -o "$voices_file"
    info "Voices downloaded to ${voices_file}"
  else
    info "Kokoro voices already cached"
  fi
}

# ── Generate beep WAVs (only if Node available) ──────────────────
generate_beeps_if_possible() {
  if ! which node &>/dev/null; then
    info "Skipping beep generation (app generates them on startup)"
    return
  fi
  generate_beeps
}

generate_beeps() {
  if [ "$NO_BEEPS" = true ]; then
    info "Skipping beep generation (--no-beeps)"
    return
  fi
  info "Generating beep WAVs..."
  # We generate them via the project's own beep module if we can,
  # otherwise fall back to a minimal Node one-liner.
  if [ -f "dist/lib/beeps.js" ]; then
    node -e "require('./dist/lib/beeps.js').ensureBeeps()" 2>/dev/null && return
  fi
  # Fallback: generate minimal WAVs
  node -e "
    const { writeFileSync, mkdirSync, existsSync } = require('fs');
    const { join } = require('path');
    const d = join(require('os').tmpdir(), 'shodan');
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    const gen = (p, freq, dur) => {
      const n = Math.floor(22050 * dur);
      const buf = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(0.5 * 32767 * (i < n/2 ? 1 : -1)), i*2);
      const h = Buffer.alloc(44);
      h.write('RIFF'); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE');
      h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
      h.writeUInt16LE(1, 22); h.writeUInt32LE(22050, 24); h.writeUInt32LE(44100, 28);
      h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
      h.write('data', 36); h.writeUInt32LE(buf.length, 40);
      writeFileSync(join(d, p), Buffer.concat([h, buf]));
    };
    gen('beep_start.wav', 880, 0.08);
    gen('beep_end.wav', 660, 0.10);
  "
  info "Beep WAVs generated"
}

# ── Verify ──────────────────────────────────────────────────────────
verify() {
  local ok=true
  echo ""
  info "Verifying installation..."

  which node       &>/dev/null && info "node         $(node --version)"      || { warn "node missing";       ok=false; }
  which sox        &>/dev/null && info "sox          $(sox --version 2>&1 | head -1)" || { warn "sox missing";      ok=false; }
  which ffmpeg     &>/dev/null && info "ffmpeg       $(ffmpeg -version 2>&1 | head -1)" || { warn "ffmpeg missing";  ok=false; }
  which whisper-cli &>/dev/null && info "whisper-cli  $(whisper-cli --version 2>&1 || echo 'installed')" || { warn "whisper-cli missing"; ok=false; }
  which speech     &>/dev/null && info "speech       $(speech --version 2>&1 || echo 'installed')" || warn "speech CLI not found (optional on Linux, used by local STT/TTS)"

  if [ "$OS" = "macos" ]; then
    which SwitchAudioSource &>/dev/null && info "SwitchAudioSource present" || warn "SwitchAudioSource missing (needed for mic selection)"
  fi

  pip3 show kokoro-tts &>/dev/null && info "kokoro-tts   $(pip3 show kokoro-tts 2>/dev/null | grep Version | cut -d' ' -f2)" || warn "kokoro-tts not installed"

  if $ok; then
    echo ""
    info "shodan-assistant is ready. Run: npx shodan"
  else
    echo ""
    warn "Some dependencies are missing. The app may still work with cloud providers."
  fi
}

# ── npm install ─────────────────────────────────────────────────────
install_npm() {
  if ! which npm &>/dev/null; then
    warn "npm not found — skipping npm install. Install manually:\n" \
         "  npm install -g shodan-assistant"
    return
  fi
  info "Installing shodan-assistant from npm..."
  cmd npm install -g shodan-assistant 2>/dev/null || {
    warn "npm install failed. Run manually:\n  npm install -g shodan-assistant"
    return
  }
  info "shodan-assistant installed globally. Run: shodan"
}

# ── Main ────────────────────────────────────────────────────────────
echo ""
echo "  shodan-assistant — dependency installer"
echo "  OS: $OS"
echo ""

case "$OS" in
  macos) install_macos  ;;
  linux) install_linux  ;;
  wsl)   install_wsl    ;;
  *)     fail "Unsupported OS: $(uname -s). Supported: macOS, Linux, WSL" ;;
esac

generate_beeps_if_possible
verify
check_node_optional
install_npm
