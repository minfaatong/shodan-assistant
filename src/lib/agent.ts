import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentOptions, AgentState, Status } from './types.js';
import { PATHS, GREETINGS } from './config.js';
import { ensureBeeps } from './beeps.js';
import { listenOnce, abortListen, getSttProvider } from './listener.js';
import { speakChunked, getTtsProvider } from './speaker.js';
import { getLlmProvider } from './llm.js';
import { log, logError } from './logger.js';
import { parseSwitchCommand, applySwitch } from './runtime-config.js';
import { bootProfile } from './profiles.js';

const execFile = promisify(execFileCb);

export interface AgentController {
  shutdown: () => void;
  pause: () => void;
  resume: () => void;
  submitText: (text: string) => void;
}

export async function runAgent(opts: AgentOptions): Promise<AgentController> {
  const state: AgentState = {
    status: 'starting',
    conversation: [],
    logs: [],
  };

  let shutdown = false;
  let paused = false;
  let pendingText: string | null = null;
  let speechAbortController: AbortController | null = null;
  let bargeAbortController: AbortController | null = null;
  const notify = () => opts.onStateChange({ ...state });

  ensureBeeps();
  bootProfile();

  if (!opts.noWarmup) {
    const sttName = getSttProvider().name;
    if (sttName.startsWith('local') || sttName.startsWith('Qwen')) {
      await execFile('bash', [PATHS.LISTEN_SH, 'qwen3', '--warmup'], { timeout: 120_000 });
    }

    const ttsName = getTtsProvider().name;
    if (ttsName.startsWith('local') || ttsName.startsWith('Kokoro')) {
      const out = `/tmp/_shodan_warmup_${process.pid}.wav`;
      try {
        await execFile('bash', [PATHS.SAY_SH, 'warmup', out], { timeout: 90_000 });
      } finally {
        try { await execFile('rm', ['-f', out]); } catch {}
      }
    }
  }

  const greeting = opts.intro ?? GREETINGS[0];
  log('agent', 'start', `greeting: "${greeting}"`);
  notify();

  if (!opts.silent) {
    await speakChunked(greeting, opts.gap ?? 1.2);
  }

  setSt('listening');
  notify();

  let reGreetTurn = 0;
  let consecutiveEmpty = 0;

  (async function loop() {
    while (!shutdown) {
      try {
        // ── Check for text input ──────────────────────────────
        if (pendingText) {
          const text = pendingText;
          pendingText = null;
          await processInput(text);
          continue;
        }

        setSt('listening');
        notify();

        // Re-check — submitText may have raced between notify() and listenOnce()
        if (pendingText) continue;

        const transcript = await listenOnce();
        if (shutdown) break;
        if (transcript === null) continue;
        if (pendingText) {
          const text = pendingText;
          pendingText = null;
          await processInput(text);
          continue;
        }

        log('stt', transcript ?? '(null)');

        // ── Handle silence ────────────────────────────────────
        if (!transcript || transcript === '(no speech detected)') {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 10 && !opts.silent) {
            consecutiveEmpty = 0;
            const g = GREETINGS[reGreetTurn % GREETINGS.length];
            reGreetTurn++;
            notify();
            speakChunked(g, opts.gap ?? 1.2).catch(() => {});
          }
          continue;
        }

        consecutiveEmpty = 0;

        // ── Check for runtime switch command ──────────────────
        const sw = parseSwitchCommand(transcript);
        if (sw) {
          const msg = applySwitch(sw);
          log('switch', `${sw.kind}-${sw.provider}: ${msg}`);
          state.conversation = [...state.conversation, { role: 'user', text: transcript }];
          notify();
          if (!opts.silent) {
            speakChunked(`Okay, ${msg}.`, opts.gap ?? 1.2).catch(() => {});
          }
          continue;
        }

        await processInput(transcript);

      } catch (err: unknown) {
        if (shutdown) break;
        logError(err, 'loop');
        setSt('idle');
        notify();
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();

    return {
        shutdown() {
      log('agent', 'shutdown');
      shutdown = true;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    submitText(text: string) {
      abortListen();
      speechAbortController?.abort();
      bargeAbortController?.abort();
      pendingText = text;
    },
  };

  function setSt(st: Status): void {
    state.status = st;
  }

  async function processInput(text: string) {
    // ── Runtime switch check (also for text input) ────────────
    const sw = parseSwitchCommand(text);
    if (sw) {
      const msg = applySwitch(sw);
      log('switch', `${sw.kind}-${sw.provider}: ${msg}`);
      state.conversation = [...state.conversation, { role: 'user', text }];
      notify();
      if (!opts.silent) {
        await speakChunked(`Okay, ${msg}.`, opts.gap ?? 1.2);
      }
      return;
    }

    setSt('thinking');
    state.conversation = [...state.conversation, { role: 'user', text }];
    notify();

    log('user', text);

    let reply: string | null;
    try {
      reply = await getLlmProvider().complete(text);
    } catch (err) {
      logError(err, 'LLM complete');
      const errMsg = `I'm having trouble reaching the LLM server. ${err instanceof Error ? err.message : 'Unknown error'}`;
      state.conversation = [...state.conversation, { role: 'assistant', text: errMsg }];
      setSt('listening');
      notify();
      if (!opts.silent) {
        speakChunked(errMsg, opts.gap ?? 1.2).catch(() => {});
      }
      return;
    }
    if (shutdown) return;

    if (reply) {
      log('assistant', reply);
      state.conversation = [...state.conversation, { role: 'assistant', text: reply }];
      setSt('speaking');
      notify();

      // ── Speak with concurrent listen for barge-in ───────────
      speechAbortController = new AbortController();
      bargeAbortController = new AbortController();

      const talk = speakChunked(reply, opts.gap ?? 1.2, speechAbortController.signal)
        .then(() => null)
        .catch((e) => {
          if (e instanceof Error && e.name === 'AbortError') return null;
          throw e;
        });

      const hear = listenOnce()
        .then((t) => t)
        .catch(() => null);

      const winner = await Promise.race([talk, hear]);
      bargeAbortController.abort();
      bargeAbortController = null;

      if (winner !== null && typeof winner === 'string') {
        // Voice input arrived during speech — cancel speech, process voice
        speechAbortController?.abort();
        speechAbortController = null;
        setSt('listening');
        notify();
        await processInput(winner);
        return;
      }

      // Speech finished without interruption
      speechAbortController = null;
      setSt('listening');
      notify();
    } else {
      setSt('listening');
      notify();
    }
  }
}
