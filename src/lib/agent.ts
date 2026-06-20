import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentOptions, AgentState, Status } from './types.js';
import { PATHS, GREETINGS } from './config.js';
import { ensureBeeps } from './beeps.js';
import { listenOnce, getSttProvider } from './listener.js';
import { speakChunked, getTtsProvider } from './speaker.js';
import { getLlmProvider } from './llm.js';
import { parseSwitchCommand, applySwitch } from './runtime-config.js';
import { bootProfile } from './profiles.js';

const execFile = promisify(execFileCb);

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

export interface AgentController {
  shutdown: () => void;
  pause: () => void;
  resume: () => void;
}

export async function runAgent(opts: AgentOptions): Promise<AgentController> {
  const state: AgentState = {
    status: 'starting',
    conversation: [],
    logs: [],
  };

  let shutdown = false;
  let paused = false;
  const notify = () => opts.onStateChange({ ...state, logs: [...state.logs] });

  ensureBeeps();

  // Show providers
  pushLog(`LLM: ${getLlmProvider().name}`);
  pushLog(`STT: ${getSttProvider().name}`);
  pushLog(`TTS: ${getTtsProvider().name}`);

  if (bootProfile()) {
    pushLog('Default profile loaded');
    pushLog(`LLM: ${getLlmProvider().name}`);
    pushLog(`STT: ${getSttProvider().name}`);
    pushLog(`TTS: ${getTtsProvider().name}`);
  }

  if (!opts.noWarmup) {
    pushLog('Warming up ASR…');
    notify();
    const sttName = getSttProvider().name;
    if (sttName.startsWith('local') || sttName.startsWith('Qwen')) {
      await execFile('bash', [PATHS.LISTEN_SH, 'qwen3', '--warmup'], { timeout: 120_000 });
    }
    pushLog('ASR ready');
    notify();

    pushLog('Warming up TTS…');
    notify();
    const ttsName = getTtsProvider().name;
    if (ttsName.startsWith('local') || ttsName.startsWith('Kokoro')) {
      const out = `/tmp/_shodan_warmup_${process.pid}.wav`;
      try {
        await execFile('bash', [PATHS.SAY_SH, 'warmup', out], { timeout: 90_000 });
      } finally {
        for (const p of [out, out.replace('.wav', '_slow.wav')]) {
          try { await execFile('rm', ['-f', p]); } catch {}
        }
      }
    }
    pushLog('TTS ready');
    notify();
  }

  const greeting = opts.intro ?? GREETINGS[0];
  pushLog(greeting);
  notify();

  if (!opts.silent) {
    speakChunked(greeting, opts.gap ?? 1.2).catch(() => {});
  }

  setSt('listening');
  notify();

  let reGreetTurn = 0;
  let consecutiveEmpty = 0;

  (async function loop() {
    while (!shutdown) {
      try {
        setSt(paused ? 'idle' : 'listening');
        notify();

        while (paused && !shutdown) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (shutdown) break;

        const transcript = await listenOnce();

        if (shutdown) break;
        if (!transcript || transcript === '(no speech detected)') {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 10 && !opts.silent) {
            consecutiveEmpty = 0;
            const g = GREETINGS[reGreetTurn % GREETINGS.length];
            reGreetTurn++;
            pushLog(g);
            notify();
            speakChunked(g, opts.gap ?? 1.2).catch(() => {});
          }
          continue;
        }

        consecutiveEmpty = 0;

        // ── Check for runtime switch command ──────────────────────
        const sw = parseSwitchCommand(transcript);
        if (sw) {
          const msg = applySwitch(sw);
          pushLog(msg);
          state.conversation = [...state.conversation, { role: 'user', text: transcript }];
          notify();
          if (!opts.silent) {
            speakChunked(`Okay, ${msg}.`, opts.gap ?? 1.2).catch(() => {});
          }
          continue;
        }
        // ───────────────────────────────────────────────────────────

        setSt('thinking');
        pushLog(`[YOU] ${transcript}`);
        state.conversation = [...state.conversation, { role: 'user', text: transcript }];
        notify();

        const reply = await getLlmProvider().complete(transcript);
        if (shutdown) break;

        if (reply) {
          pushLog(`[SHODAN] ${reply}`);
          state.conversation = [...state.conversation, { role: 'assistant', text: reply }];
          setSt('speaking');
          notify();

          if (!opts.silent) {
            await speakChunked(reply, opts.gap ?? 1.2);
          }

          setSt('listening');
          notify();
        } else {
          pushLog('[LLM] no response');
          setSt('listening');
          notify();
        }
      } catch (err: unknown) {
        if (shutdown) break;
        const msg = err instanceof Error ? err.message : String(err);
        pushLog(`Error: ${msg}`);
        setSt('idle');
        notify();
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();

  return {
    shutdown() {
      shutdown = true;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
  };

  function pushLog(msg: string): void {
    const line = `[${ts()}] ${msg}`;
    state.logs = [...state.logs.slice(-99), line];
  }

  function setSt(st: Status): void {
    state.status = st;
  }
}
