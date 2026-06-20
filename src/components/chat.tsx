import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Message } from '../lib/types.js';

interface Props {
  messages: Message[];
  maxLines: number;
}

export default function Chat({ messages, maxLines }: Props) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevLen = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevLen.current) {
      setScrollOffset(0);
    }
    prevLen.current = messages.length;
  }, [messages.length]);

  useInput((_input, key) => {
    if (key.upArrow) {
      setScrollOffset((p) => Math.min(p + 1, messages.length - 1));
    }
    if (key.downArrow) {
      setScrollOffset((p) => Math.max(0, p - 1));
    }
  });

  const end = Math.max(0, messages.length - scrollOffset);
  const start = Math.max(0, end - maxLines);
  const visible = messages.slice(start, end);

  if (visible.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray" italic>
          Waiting for conversation…
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column-reverse" flexGrow={1} width="100%">
      {[...visible].reverse().map((msg, i) => (
        <Box key={start + i}>
          <Text color={msg.role === 'user' ? 'cyan' : 'green'} bold>
            {msg.role === 'user' ? 'You' : 'Shodan'}:
          </Text>
          <Text color={msg.role === 'user' ? 'cyan' : 'green'}>
            {' '}{msg.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
