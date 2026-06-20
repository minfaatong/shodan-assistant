import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import StatusBar from './components/status-bar.js';
import Chat from './components/chat.js';
import Portrait from './components/portrait.js';
import CommandInput from './components/command-input.js';
import CommandMenu from './components/command-menu.js';
import { useTermSize } from './lib/use-term-size.js';
import { runAgent } from './lib/agent.js';
import { getLlmProvider } from './lib/llm.js';
import { getSttProvider } from './lib/listener.js';
import { getTtsProvider } from './lib/speaker.js';
import { parseCommand, type CommandResult, type MenuDef } from './lib/commands.js';
import type { AgentState } from './lib/types.js';
import type { AgentController } from './lib/agent.js';

const MIN_ROWS = 22;
const MIN_COLS = 60;
const INITIAL: AgentState = {
  status: 'starting',
  conversation: [],
  logs: [],
};

type InputMode =
  | { type: 'none' }
  | { type: 'menu'; def: MenuDef; cursor: number }
  | { type: 'keyinput'; buffer: string; cursor: number; prompt: string; onSubmit: (value: string) => CommandResult };

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
  const [inputMode, setInputMode] = useState<InputMode>({ type: 'none' });
  const [chatScrollOffset, setChatScrollOffset] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [textBuffer, setTextBuffer] = useState('');
  const [textCursor, setTextCursor] = useState(0);
  const inputRef = useRef({ buffer: '', cursor: 0 });
  const pendingQueue = useRef<string[]>([]);

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
      for (const t of pendingQueue.current) ctrl.submitText(t);
      pendingQueue.current = [];
    });

    return () => {
      ctrlRef.current?.shutdown();
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  function handleCommandResult(result: CommandResult) {
    switch (result.type) {
      case 'done':
        showFeedback(result.message);
        setInputMode({ type: 'none' });
        ctrlRef.current?.resume();
        break;
      case 'menu':
        setInputMode({ type: 'menu', def: result.menu, cursor: 0 });
        break;
      case 'keyinput':
        setInputMode({ type: 'keyinput', buffer: '', cursor: 0, prompt: result.prompt, onSubmit: result.onSubmit });
        break;
      case 'quit':
        ctrlRef.current?.shutdown();
        exit();
        break;
    }
  }

  function submitText(text: string) {
    if (!text.trim()) return;
    if (text.startsWith('/')) {
      const result = parseCommand(text);
      handleCommandResult(result);
    } else if (ctrlRef.current) {
      ctrlRef.current.submitText(text);
    } else {
      pendingQueue.current.push(text);
    }
  }

  useInput((input, key) => {
    if (inputMode.type === 'menu') {
      if (key.escape) {
        setInputMode({ type: 'none' });
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

    if (inputMode.type === 'keyinput') {
      if (key.escape) {
        setInputMode({ type: 'none' });
        return;
      }
      if (key.return) {
        const value = inputMode.buffer.trim();
        if (value) {
          const result = inputMode.onSubmit(value);
          handleCommandResult(result);
        } else {
          showFeedback('No input entered, cancelled');
          setInputMode({ type: 'none' });
        }
        return;
      }
      if (key.leftArrow) {
        setInputMode((prev) =>
          prev.type === 'keyinput'
            ? { ...prev, cursor: Math.max(0, prev.cursor - 1) }
            : prev,
        );
        return;
      }
      if (key.rightArrow) {
        setInputMode((prev) =>
          prev.type === 'keyinput'
            ? { ...prev, cursor: Math.min(prev.buffer.length, prev.cursor + 1) }
            : prev,
        );
        return;
      }
      if (key.backspace) {
        setInputMode((prev) => {
          if (prev.type !== 'keyinput') return prev;
          if (prev.cursor <= 0) return prev;
          const buf = prev.buffer.slice(0, prev.cursor - 1) + prev.buffer.slice(prev.cursor);
          return { ...prev, buffer: buf, cursor: prev.cursor - 1 };
        });
        return;
      }
      if (input) {
        setInputMode((prev) => {
          if (prev.type !== 'keyinput') return prev;
          const buf = prev.buffer.slice(0, prev.cursor) + input + prev.buffer.slice(prev.cursor);
          return { ...prev, buffer: buf, cursor: prev.cursor + 1 };
        });
        return;
      }
      return;
    }

    // Text input mode (none) — read/write inputRef for latest values across batched callbacks
    if (input === '\x03') {
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
    if (key.escape) {
      inputRef.current = { buffer: '', cursor: 0 };
      setTextBuffer('');
      setTextCursor(0);
      return;
    }
    if (key.return) {
      submitText(inputRef.current.buffer);
      inputRef.current = { buffer: '', cursor: 0 };
      setTextBuffer('');
      setTextCursor(0);
      return;
    }
    if (key.leftArrow) {
      inputRef.current = { ...inputRef.current, cursor: Math.max(0, inputRef.current.cursor - 1) };
      setTextCursor(inputRef.current.cursor);
      return;
    }
    if (key.rightArrow) {
      inputRef.current = { ...inputRef.current, cursor: Math.min(inputRef.current.buffer.length, inputRef.current.cursor + 1) };
      setTextCursor(inputRef.current.cursor);
      return;
    }
    if (key.backspace) {
      const { buffer, cursor } = inputRef.current;
      if (cursor > 0) {
        const nextBuf = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
        inputRef.current = { buffer: nextBuf, cursor: cursor - 1 };
        setTextBuffer(nextBuf);
        setTextCursor(cursor - 1);
      }
      return;
    }
    if (input) {
      const { buffer, cursor } = inputRef.current;
      const nextBuf = buffer.slice(0, cursor) + input + buffer.slice(cursor);
      inputRef.current = { buffer: nextBuf, cursor: cursor + 1 };
      setTextBuffer(nextBuf);
      setTextCursor(cursor + 1);
    }
  });

  const tooSmall = rows < MIN_ROWS || cols < MIN_COLS;

  let portraitLines = 31;
  if (rows < 36) portraitLines = 18;
  if (rows < 27) portraitLines = 13;

  const showRule = rows >= 25;

  const hasOverlay = inputMode.type !== 'none';
  const headerRows = 1 + (showRule ? 1 : 0);
  const contentRows = rows - headerRows - 2;
  const maxChatLines = Math.max(15, contentRows);

  const providerLabel = `LLM:${getLlmProvider().name} STT:${getSttProvider().name} TTS:${getTtsProvider().name}`;

  let overlayContent: React.ReactNode = null;
  if (inputMode.type === 'menu') {
    overlayContent = <CommandMenu def={inputMode.def} cursor={inputMode.cursor} />;
  } else if (inputMode.type === 'keyinput') {
    overlayContent = (
      <Text>
        <Text color="yellow">{inputMode.prompt} </Text>
        <Text>{inputMode.buffer.slice(0, inputMode.cursor)}</Text>
        <Text color="yellow">█</Text>
        <Text>{inputMode.buffer.slice(inputMode.cursor)}</Text>
        <Text dimColor>{inputMode.buffer.length === 0 ? '(type and press ⏎)' : ''}</Text>
      </Text>
    );
  }

  const before = textBuffer.slice(0, textCursor);
  const after = textBuffer.slice(textCursor);

  if (tooSmall) {
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <Text bold color="green">Shodan Voice Agent</Text>
        <Text> </Text>
        <Text color="gray">Requires at least {MIN_ROWS} rows × {MIN_COLS} columns</Text>
        <Text color="gray">Current: {rows} × {cols}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
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
          <Chat
            messages={state.conversation}
            maxLines={maxChatLines}
            scrollOffset={chatScrollOffset}
            onScroll={setChatScrollOffset}
            footer={hasOverlay ? overlayContent : undefined}
          />
        </Box>
      </Box>

      <Box marginX={1}>
        <CommandInput buffer={textBuffer} cursor={textCursor} width={cols - 2} />
      </Box>

      <Box marginX={1}>
        <Text backgroundColor="#1c1c1c" color="gray" dimColor>
          {'  '}{'Ctrl+C quit | /help commands'.padEnd(cols - 6)}
        </Text>
      </Box>

      {feedbackMsg && (
        <Box marginX={1}>
          <Text backgroundColor="#1c1c1c" color="green">{feedbackMsg.padEnd(cols - 2)}</Text>
        </Box>
      )}
    </Box>
  );
}
