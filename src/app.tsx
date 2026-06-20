import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import StatusBar from './components/status-bar.js';
import Chat from './components/chat.js';
import Portrait from './components/portrait.js';
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

type Popup =
  | null
  | { type: 'message'; text: string }
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
  const [popup, setPopup] = useState<Popup>(null);
  const [chatScrollOffset, setChatScrollOffset] = useState(0);
  const [textBuffer, setTextBuffer] = useState('');
  const [textCursor, setTextCursor] = useState(0);
  const inputRef = useRef({ buffer: '', cursor: 0 });
  const pendingQueue = useRef<string[]>([]);

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
    };
  }, []);

  const dismissPopup = useCallback(() => {
    setPopup(null);
  }, []);

  function handleCommandResult(result: CommandResult) {
    switch (result.type) {
      case 'done':
        setPopup({ type: 'message', text: result.message });
        ctrlRef.current?.resume();
        break;
      case 'menu':
        setPopup({ type: 'menu', def: result.menu, cursor: 0 });
        break;
      case 'keyinput':
        setPopup({ type: 'keyinput', buffer: '', cursor: 0, prompt: result.prompt, onSubmit: result.onSubmit });
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
    // Popup overlay has priority
    if (popup) {
      if (key.escape) {
        dismissPopup();
        return;
      }
      if (popup.type === 'menu') {
        if (key.upArrow) {
          setPopup({ ...popup, cursor: Math.max(0, popup.cursor - 1) });
          return;
        }
        if (key.downArrow) {
          setPopup({ ...popup, cursor: Math.min(popup.def.items.length - 1, popup.cursor + 1) });
          return;
        }
        if (key.return) {
          const result = popup.def.onSelect(popup.cursor);
          handleCommandResult(result);
          return;
        }
        return;
      }
      if (popup.type === 'keyinput') {
        if (key.return) {
          const value = popup.buffer.trim();
          if (value) {
            const result = popup.onSubmit(value);
            handleCommandResult(result);
          } else {
            dismissPopup();
          }
          return;
        }
        if (key.leftArrow) {
          setPopup({ ...popup, cursor: Math.max(0, popup.cursor - 1) });
          return;
        }
        if (key.rightArrow) {
          setPopup({ ...popup, cursor: Math.min(popup.buffer.length, popup.cursor + 1) });
          return;
        }
        if (key.backspace) {
          if (popup.cursor > 0) {
            const buf = popup.buffer.slice(0, popup.cursor - 1) + popup.buffer.slice(popup.cursor);
            setPopup({ ...popup, buffer: buf, cursor: popup.cursor - 1 });
          }
          return;
        }
        if (input) {
          const buf = popup.buffer.slice(0, popup.cursor) + input + popup.buffer.slice(popup.cursor);
          setPopup({ ...popup, buffer: buf, cursor: popup.cursor + 1 });
          return;
        }
        return;
      }
      if (popup.type === 'message') {
        // Any key dismisses
        dismissPopup();
        return;
      }
      return;
    }

    // Text input mode — read/write inputRef for latest values across batched callbacks
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

  let portraitLines = 33;
  if (rows < 36) portraitLines = 20;
  if (rows < 27) portraitLines = 15;

  const showRule = rows >= 25;

  const headerRows = 1 + (showRule ? 1 : 0);
  const contentRows = rows - headerRows - 1;
  const maxChatLines = Math.max(15, contentRows);

  const providerLabel = `LLM:${getLlmProvider().name} STT:${getSttProvider().name} TTS:${getTtsProvider().name}`;

  let popupContent: React.ReactNode = null;
  if (popup) {
    if (popup.type === 'menu') {
      popupContent = (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <CommandMenu def={popup.def} cursor={popup.cursor} />
        </Box>
      );
    } else if (popup.type === 'keyinput') {
      popupContent = (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text>
            <Text color="yellow">{popup.prompt} </Text>
            <Text>{popup.buffer.slice(0, popup.cursor)}</Text>
            <Text color="yellow">█</Text>
            <Text>{popup.buffer.slice(popup.cursor)}</Text>
            <Text dimColor>{popup.buffer.length === 0 ? '(type and press ⏎)' : ''}</Text>
          </Text>
        </Box>
      );
    } else if (popup.type === 'message') {
      popupContent = (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          {popup.text.split('\n').map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      );
    }
  }

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

      <Box flexDirection="row" flexGrow={1} marginX={1} overflow="hidden">
        <Box flexShrink={0} marginRight={2}>
          <Portrait animate={state.status === 'speaking'} maxLines={portraitLines} />
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Chat
            messages={state.conversation}
            maxLines={maxChatLines}
            scrollOffset={chatScrollOffset}
            onScroll={setChatScrollOffset}
          />
        </Box>
      </Box>

      <Box flexShrink={0} marginX={1}>
        <Text backgroundColor="#1c1c1c">
          <Text color="gray">{'  '}</Text>
          <Text color="yellow" bold>{'>'}</Text>
          <Text color="white"> {textBuffer.slice(0, textCursor)}</Text>
          <Text color="yellow">█</Text>
          <Text color="white">{textBuffer.slice(textCursor)}</Text>
        </Text>
        <Text backgroundColor="#1c1c1c" color="gray" dimColor>
          {'  Ctrl+C quit | /help commands'}
        </Text>
      </Box>

      {popupContent && (
        <Box position="absolute" width={cols} height={rows} alignItems="center" justifyContent="center">
          {popupContent}
        </Box>
      )}
    </Box>
  );
}
