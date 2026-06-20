import React, { useState, useEffect, useRef } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import StatusBar from './components/status-bar.js';
import Chat from './components/chat.js';
import LogPanel from './components/log-panel.js';
import Portrait from './components/portrait.js';
import { runAgent } from './lib/agent.js';
import { getLlmProvider } from './lib/llm.js';
import { getSttProvider } from './lib/listener.js';
import { getTtsProvider } from './lib/speaker.js';
import type { AgentState } from './lib/types.js';
import type { AgentController } from './lib/agent.js';

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

  return (
    <Box flexDirection="column" minHeight="100%">
      <StatusBar status={state.status} />

      <Box flexGrow={1} marginX={1}>
        <Chat messages={state.conversation} />
      </Box>

      <Box flexDirection="row" marginX={1} marginBottom={1}>
        <Portrait />
        <Box flexDirection="column">
          <Text color="gray" italic>
            LLM: {getLlmProvider().name}
          </Text>
          <Text color="gray" italic>
            STT: {getSttProvider().name}
          </Text>
          <Text color="gray" italic>
            TTS: {getTtsProvider().name}
          </Text>
          <LogPanel logs={state.logs} />
        </Box>
      </Box>
    </Box>
  );
}
