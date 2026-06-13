#!/usr/bin/env python3
"""
shodan_agent.py — Multi-threaded voice agent

Architecture:
  ┌──────────────────────────────────────────────────────┐
  │  Listener Thread (always listening)                 │
  │    → listen_stream.sh loop                          │
  │    → when speech detected: put transcript in queue  │
  │    → plays 2× beep after recording                  │
  └──────────────────────────────────────────────────────┘
                           │
                           │ request_queue (LLM gets one req at a time)
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │  Speaker Thread (always ready to speak)              │
  │    → consumes LLM responses                        │
  │    → plays 1× beep before speaking                 │
  │    → speaks / plays quick clips + chunks           │
  │    → short silence between response chunks         │
  └──────────────────────────────────────────────────────┘

Usage:
  python3 shodan_agent.py                        # defaults
  python3 shodan_agent.py --intro "Hello..."  # custom intro greeting
  python3 shodan_agent.py --interval 1.0       # gap between chunks
  python3 shodan_agent.py --silent             # log only, no TTS
"""

import argparse
import json
import os
import queue
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────

SKILL_DIR  = Path(__file__).parent
SAY_SH     = Path.home() / ".qclaw/skills/isabella-tts/scripts/say.sh"
LISTEN_SH  = SKILL_DIR / "scripts" / "listen_stream.sh"
BEEP_START = "/tmp/beep_start.wav"   # 1× beep  — start of recording
BEEP_END   = "/tmp/beep_end.wav"     # played twice — end of recording

# ── Defaults ─────────────────────────────────────────────────────

LLAMA_BASE    = os.environ.get("LLAMA_BASE",  "http://127.0.0.1:8080/v1")
LLAMA_MODEL   = os.environ.get("LLAMA_MODEL", "gemma4-e4b")
SYSTEM_PROMPT = (
    "You are Shodan, a calm, direct voice assistant. "
    "Keep responses short — one or two sentences maximum. "
    "You initiate each turn with a clear prompt or question."
)
GREETINGS = [
    "Hi, I'm Shodan. What can I do for you today?",
    "Hey, Shodan here. What would you like help with?",
    "Hello, I'm ready. What shall we work on?",
]

# Quick-response clips (pre-recorded, instant)
QUICK_RESPONSES = {
    "i'm here":          "im_here",
    "im here":           "im_here",
    "here":              "im_here",
    "go ahead":          "go_ahead",
    "go ahead.":         "go_ahead",
    "okay":              "okay",
    "okay.":             "okay",
    "ok":                "okay",
    "sure":              "sure",
    "sure.":             "sure",
    "mm-hm":             "mmhm",
    "mm hm":             "mmhm",
    "one moment":        "one_moment",
    "one sec":           "one_moment",
    "wait":              "one_moment",
    "sorry":             "sorry",
    "sorry?":            "sorry",
    "what":              "sorry",
    "huh":               "sorry",
    "didn't catch":      "didnt_catch",
    "didnt catch":       "didnt_catch",
}
QUICK_DIR = Path("/tmp/shodan_quick")
PLAYER    = "afplay" if sys.platform == "darwin" else "aplay"

# ── Shared state ─────────────────────────────────────────────────

request_queue  = queue.Queue()   # user transcripts → main loop → LLM → response_queue
response_queue = queue.Queue()   # LLM responses → speaker thread
startup_done   = threading.Event()  # signaled after warmup + greeting queued
shutdown_ev    = threading.Event()

# ── Logging ──────────────────────────────────────────────────────

def _log(*args, **kw):
    _flush = kw.pop("flush", True)
    print(f"[{time.strftime('%H:%M:%S')}]", *args, flush=_flush, **kw)


# ── Beeps ────────────────────────────────────────────────────────

def beep_start():
    """1× beep — signals start of recording."""
    try:
        subprocess.run([PLAYER, BEEP_START],
                       capture_output=True, timeout=3)
    except Exception:
        pass

def beep_end():
    """2× beep — signals end of recording."""
    try:
        subprocess.run([PLAYER, BEEP_END],
                       capture_output=True, timeout=3)
        time.sleep(0.15)
        subprocess.run([PLAYER, BEEP_END],
                       capture_output=True, timeout=3)
    except Exception:
        pass


# ── Quick clip playback ───────────────────────────────────────────

def quick(text: str) -> bool:
    """Play pre-recorded clip if available. Returns True if played."""
    t = text.lower().strip().strip(".,!?")
    clip = None
    for key, val in QUICK_RESPONSES.items():
        if key in t:
            clip = val
            break
    if not clip:
        return False
    path = QUICK_DIR / f"{clip}_slow.wav"
    if path.exists():
        try:
            subprocess.run([PLAYER, str(path)],
                           capture_output=True, timeout=5)
            return True
        except Exception:
            pass
    return False


# ── TTS ──────────────────────────────────────────────────────────

def tts(text: str):
    """Synthesize text via say.sh (Kokoro bf_isabella)."""
    if not text:
        return
    out = f"/tmp/_shodan_tts_{os.getpid()}.wav"
    try:
        r = subprocess.run(
            [str(SAY_SH), text, out],
            capture_output=True, timeout=90,
        )
        if r.returncode != 0:
            _log(f"[TTS] say.sh failed: {r.stderr[:200]}")
    except subprocess.TimeoutExpired:
        _log("[TTS] timeout")
    except Exception as e:
        _log(f"[TTS] error: {e}")
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass


def speak(text: str):
    """Speak text — try quick clip first, fall back to TTS."""
    if not text:
        return
    if quick(text):
        return
    tts(text)


# ── Response chunking ─────────────────────────────────────────────

def split_response(text: str, max_chars: int = 200) -> list[str]:
    """
    Split a response into speakable chunks at sentence boundaries.
    Each chunk ≤ max_chars. Used for natural pacing.
    """
    import re
    # Split on sentence-ending punctuation followed by space or end
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks = []
    current = ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(current) + len(s) + 1 <= max_chars:
            current = (current + " " + s).strip()
        else:
            if current:
                chunks.append(current)
            # If single sentence exceeds max_chars, force-split on clause
            if len(s) > max_chars:
                parts = re.split(r'(?<=[,;:])\s+', s)
                current = ""
                for p in parts:
                    if len(current) + len(p) + 1 <= max_chars:
                        current = (current + " " + p).strip()
                    else:
                        if current:
                            chunks.append(current)
                        current = p.strip()
                # Carry remaining
                if current:
                    chunks.append(current)
                    current = ""
            else:
                current = s
    if current:
        chunks.append(current)
    return [c for c in chunks if c]


# ── Listener Thread ───────────────────────────────────────────────
#
#   Runs listen_stream.sh in a loop, continuously listening.
#   When speech is detected, puts transcript in request_queue.
#   Plays 1× beep at start of recording, 2× beep at end.
#

def listener_thread():
    _log("[Listener] started — continuous listening active")
    while not shutdown_ev.is_set():
        try:
            # Blocking wait for next recording+transcription
            # listen_stream.sh times out internally on silence
            r = subprocess.run(
                ["bash", str(LISTEN_SH), "qwen3"],
                capture_output=True, timeout=120,
            )
            txt = r.stdout.decode("utf-8", errors="replace").strip()
            if shutdown_ev.is_set():
                break
            # 2× beep: end of recording
            beep_end()
            if not txt or txt == "(no speech detected)":
                continue
            _log(f"[Listener] [YOU] {txt}")
            # Put in queue — blocks if queue is full (size=1, non-blocking put)
            try:
                request_queue.put_nowait(txt.lower())
            except queue.Full:
                # Drop oldest, add new
                try:
                    request_queue.get_nowait()
                except queue.Empty:
                    pass
                request_queue.put(txt.lower())
        except subprocess.TimeoutExpired:
            # listen_stream.sh timed out — no speech, loop back
            continue
        except Exception as e:
            if not shutdown_ev.is_set():
                _log(f"[Listener] error: {e}")
            time.sleep(1)
    _log("[Listener] stopped")


# ── Speaker Thread ───────────────────────────────────────────────
#
#   Consumes responses from response_queue.
#   Plays 1× beep before speaking, then speaks each chunk
#   with a short silence gap between them.
#

def speaker_thread(chunk_gap: float = 1.2):
    """Play LLM responses as speech chunks with natural gaps."""
    # Wait until warmup is done and greeting is queued — never speak prematurely
    startup_done.wait()
    _log("[Speaker] ready")
    while not shutdown_ev.is_set():
        try:
            text = response_queue.get(timeout=0.5)
        except queue.Empty:
            continue

        # 1× beep before speaking (start of assistant turn)
        beep_start()

        chunks = split_response(text)
        for i, chunk in enumerate(chunks):
            if shutdown_ev.is_set():
                break
            _log(f"[Speaker] [SHODAN] {chunk}")
            speak(chunk)
            if i < len(chunks) - 1:
                time.sleep(chunk_gap)  # short silence between chunks
        response_queue.task_done()
    _log("[Speaker] stopped")


# ── LLM ──────────────────────────────────────────────────────────

def query_llm(prompt: str) -> str:
    body = {
        "model":      LLAMA_MODEL,
        "prompt":     f"{SYSTEM_PROMPT}\n\nUser: {prompt}\nShodan:",
        "max_tokens": 512,
        "temperature": 0.7,
        "stream":     False,
    }
    try:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{LLAMA_BASE}/completions",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            return result["choices"][0]["text"].strip()
    except Exception as e:
        _log(f"[LLM] error: {e}")
        return ""


# ── Warmup ───────────────────────────────────────────────────────

def warmup():
    _log("Warming up ASR...")
    subprocess.run(
        ["bash", str(LISTEN_SH), "qwen3", "--warmup"],
        capture_output=True, timeout=120,
    )
    _log("ASR ready")

    _log("Warming up TTS...")
    out = f"/tmp/_shodan_warmup_{os.getpid()}.wav"
    subprocess.run(
        [str(SAY_SH), "warmup", out],
        capture_output=True, timeout=90,
    )
    try:
        os.unlink(out)
    except OSError:
        pass
    _log("TTS ready")


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="shodan_agent — voice agent")
    parser.add_argument(
        "--intro", default=None,
        help="Override the first greeting spoken on startup",
    )
    parser.add_argument(
        "--gap", type=float, default=1.2,
        help="Silence seconds between response chunks (default: 1.2)",
    )
    parser.add_argument(
        "--silent", action="store_true",
        help="Skip TTS — log responses only",
    )
    parser.add_argument(
        "--no-warmup", action="store_true",
        help="Skip warmup step",
    )
    args = parser.parse_args()

    _log("=" * 52)
    _log("  Shodan Agent  (multi-threaded)")
    _log(f"  LLM:      {LLAMA_MODEL} @ {LLAMA_BASE}")
    _log(f"  TTS:      say.sh (Kokoro bf_isabella)")
    _log(f"  ASR:      listen_stream.sh (Qwen3-ASR)")
    _log(f"  Chunk gap:{args.gap}s")
    _log("=" * 52)

    if not args.no_warmup:
        warmup()

    # Start speaker thread — it will wait for startup_done before speaking
    speaker = threading.Thread(target=speaker_thread,
                               args=(args.gap,), daemon=True)
    speaker.start()

    # Start listener thread
    listener = threading.Thread(target=listener_thread, daemon=True)
    listener.start()

    # Startup greeting — queued AFTER warmup is done, so speaker waits for it
    greeting = args.intro or GREETINGS[0]
    _log(f"[Startup] {greeting}")
    if not args.silent:
        response_queue.put(greeting)
    else:
        _log(f"[SILENT] {greeting}")
    startup_done.set()  # ← NOW speaker may begin speaking

    # Main loop: drain request_queue, query LLM, put response in response_queue
    # (runs in main thread; listener and speaker run independently)
    consecutive_empty = 0
    turn = 0

    try:
        while True:
            try:
                transcript = request_queue.get(timeout=2)
            except queue.Empty:
                consecutive_empty += 1
                if consecutive_empty >= 10:
                    # Every ~20s when idle, re-greet
                    consecutive_empty = 0
                    greeting = GREETINGS[turn % len(GREETINGS)]
                    turn += 1
                    if not args.silent:
                        response_queue.put(greeting)
                continue

            consecutive_empty = 0
            _log("...thinking...", end="", flush=True)
            reply = query_llm(transcript)
            print()

            if reply:
                if not args.silent:
                    response_queue.put(reply)
                else:
                    _log(f"[SILENT] {reply}")
            else:
                _log("[LLM] no response")

    except KeyboardInterrupt:
        pass
    finally:
        _log("Shutting down...")
        shutdown_ev.set()
        listener.join(timeout=3)
        speaker.join(timeout=3)
        _log("Done.")


if __name__ == "__main__":
    main()
