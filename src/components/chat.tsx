import React from 'react';
import { Static, Text } from 'ink';
import type { Message } from '../lib/types.js';

interface Props {
  messages: Message[];
}

export default function Chat({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <Text color="gray" italic>
        Waiting for conversation…
      </Text>
    );
  }

  return (
    <Static items={messages}>
      {(msg, i) => (
        <Text key={i} color={msg.role === 'user' ? 'cyan' : 'green'}>
          <Text bold>{msg.role === 'user' ? 'You' : 'Shodan'}:</Text>
          {' '}{msg.text}
        </Text>
      )}
    </Static>
  );
}
