import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import StatusBar from './components/status-bar.js';
import Chat from './components/chat.js';
import LogPanel from './components/log-panel.js';
import Portrait from './components/portrait.js';
import { useTermSize } from './lib/use-term-size.js';
import { runAgent } from './lib/agent.js';
import { getLlmProvider } from './lib/llm.js';
import { getSttProvider } from './lib/listener.js';
import { getTtsProvider } from './lib/speaker.js';
import type { AgentState } from './lib/types.js';
import type { AgentController } from './lib/agent.js';

const MIN_ROWS = 22;
const MIN_COLS = 60;
const INITIAL: AgentState = {
  status: 'starting',
  conversation: [],
  logs: [],
};

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

    return () => ctrlRef.current?.shutdown();
  }, []);

  useInput((input) => {
    if (input === 'q' || input === '\x03') {
      ctrlRef.current?.shutdown();
      exit();
    }
  });

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
          <Portrait animate={state.status === 'speaking'} maxLines={portraitLines} />
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Chat messages={state.conversation} maxLines={maxChatLines} />
          <LogPanel logs={state.logs} />
        </Box>
      </Box>
    </Box>
  );
}
