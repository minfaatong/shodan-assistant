import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import StatusBar from './components/status-bar.js';
import Chat from './components/chat.js';
import LogPanel from './components/log-panel.js';
import Portrait from './components/portrait.js';
import CommandInput from './components/command-input.js';
import CommandMenu from './components/command-menu.js';
import { useTermSize } from './lib/use-term-size.js';
import { runAgent } from './lib/agent.js';
import { getLlmProvider } from './lib/llm.js';
import { getSttProvider } from './lib/listener.js';
import { getTtsProvider } from './lib/speaker.js';
import { parseCommand } from './lib/commands.js';
import type { AgentState } from './lib/types.js';
import type { AgentController } from './lib/agent.js';
import type { MenuDef } from './lib/commands.js';

const MIN_ROWS = 22;
const MIN_COLS = 60;
const INITIAL: AgentState = {
  status: 'starting',
  conversation: [],
  logs: [],
};

type InputMode =
  | { type: 'idle' }
  | { type: 'command'; buffer: string }
  | { type: 'menu'; def: MenuDef; cursor: number };

interface Props {
  intro?: string;
  gap?: number;
  silent?: boolean;
  noWarmup?: boolean;
}

export default function App({ intro, gap, silent, noWarmup }: Props) {
  const [state, setState] = useState<AgentState>(INITIAL);
  const { exit } = useApp();
  const ctrlRef = useRef<AgentController | null>(null);
  const { rows, cols } = useTermSize();
  const [inputMode, setInputMode] = useState<InputMode>({ type: 'idle' });
  const [chatScrollOffset, setChatScrollOffset] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((msg: string) => {
    setFeedbackMsg(msg);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedbackMsg(null), 5000);
  }, []);

  useEffect(() => {
    runAgent({
      intro,
      gap,
      silent,
      noWarmup,
      onStateChange: setState,
    }).then((ctrl) => {
      ctrlRef.current = ctrl;
    });

    return () => {
      ctrlRef.current?.shutdown();
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  useInput((input, key) => {
    if (inputMode.type === 'idle') {
      if (input === 'q' || input === '\x03') {
        ctrlRef.current?.shutdown();
        exit();
        return;
      }
      if (key.upArrow) {
        setChatScrollOffset((p) =>
          Math.min(p + 1, Math.max(0, state.conversation.length - 1)),
        );
        return;
      }
      if (key.downArrow) {
        setChatScrollOffset((p) => Math.max(0, p - 1));
        return;
      }
      if (input === '/') {
        setInputMode({ type: 'command', buffer: '/' });
        ctrlRef.current?.pause();
        return;
      }
      return;
    }

    if (inputMode.type === 'command') {
      if (key.escape) {
        setInputMode({ type: 'idle' });
        ctrlRef.current?.resume();
        return;
      }
      if (key.return) {
        const result = parseCommand(inputMode.buffer);
        handleCommandResult(result);
        return;
      }
      if (key.backspace) {
        const next = inputMode.buffer.slice(0, -1);
        if (next === '' || next === '/') {
          setInputMode({ type: 'idle' });
          ctrlRef.current?.resume();
        } else {
          setInputMode({ type: 'command', buffer: next });
        }
        return;
      }
      if (input) {
        setInputMode((prev) =>
          prev.type === 'command'
            ? { type: 'command', buffer: prev.buffer + input }
            : prev,
        );
        return;
      }
      return;
    }

    if (inputMode.type === 'menu') {
      if (key.escape) {
        setInputMode({ type: 'idle' });
        ctrlRef.current?.resume();
        return;
      }
      if (key.upArrow) {
        setInputMode((prev) =>
          prev.type === 'menu'
            ? { ...prev, cursor: Math.max(0, prev.cursor - 1) }
            : prev,
        );
        return;
      }
      if (key.downArrow) {
        setInputMode((prev) =>
          prev.type === 'menu'
            ? { ...prev, cursor: Math.min(prev.def.items.length - 1, prev.cursor + 1) }
            : prev,
        );
        return;
      }
      if (key.return) {
        const result = inputMode.def.onSelect(inputMode.cursor);
        handleCommandResult(result);
        return;
      }
      return;
    }
  });

  function handleCommandResult(
    result: ReturnType<typeof parseCommand>,
  ) {
    switch (result.type) {
      case 'done':
        showFeedback(result.message);
        setInputMode({ type: 'idle' });
        ctrlRef.current?.resume();
        break;
      case 'menu':
        setInputMode({ type: 'menu', def: result.menu, cursor: 0 });
        break;
      case 'quit':
        ctrlRef.current?.shutdown();
        exit();
        break;
    }
  }

  const tooSmall = rows < MIN_ROWS || cols < MIN_COLS;

  let portraitLines = 33;
  if (rows < 36) portraitLines = 20;
  if (rows < 27) portraitLines = 15;

  const showRule = rows >= 25;

  const chatHeight = rows - 1 - (showRule ? 1 : 0);
  const maxChatLines = Math.max(1, chatHeight - 2);

  const providerLabel = `LLM:${getLlmProvider().name} STT:${getSttProvider().name} TTS:${getTtsProvider().name}`;

  if (tooSmall) {
    return (
      <Box flexDirection="column" minHeight="100%" alignItems="center" justifyContent="center">
        <Text bold color="green">Shodan Voice Agent</Text>
        <Text> </Text>
        <Text color="gray">Requires at least {MIN_ROWS} rows &times; {MIN_COLS} columns</Text>
        <Text color="gray">Current: {rows} &times; {cols}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" minHeight="100%">
      <StatusBar status={state.status} rightLabel={providerLabel} />

      {showRule && (
        <Text color="gray" dimColor>
          {'─'.repeat(Math.max(cols, 40))}
        </Text>
      )}

      <Box flexDirection="row" flexGrow={1} marginX={1} marginBottom={0}>
        <Box flexShrink={0} marginRight={2}>
          <Portrait animate={state.status === 'speaking' || state.status === 'listening'} maxLines={portraitLines} />
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Chat
            messages={state.conversation}
            maxLines={maxChatLines}
            scrollOffset={chatScrollOffset}
            onScroll={setChatScrollOffset}
          />
          <LogPanel logs={state.logs} />
        </Box>
      </Box>

      {inputMode.type === 'command' && (
        <Box marginX={1} marginBottom={1}>
          <CommandInput buffer={inputMode.buffer} />
        </Box>
      )}

      {inputMode.type === 'menu' && (
        <Box marginX={1} marginBottom={1}>
          <CommandMenu def={inputMode.def} cursor={inputMode.cursor} />
        </Box>
      )}

      {feedbackMsg && (
        <Box marginX={1} marginBottom={1}>
          <Text color="green">{feedbackMsg}</Text>
        </Box>
      )}
    </Box>
  );
}
