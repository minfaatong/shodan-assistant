import React from 'react';
import { Text } from 'ink';

interface Props {
  buffer: string;
  cursor: number;
  width: number;
}

export default function CommandInput({ buffer, cursor, width }: Props) {
  const before = buffer.slice(0, cursor);
  const after = buffer.slice(cursor);
  const padLen = Math.max(0, width - 2 - buffer.length);
  return (
    <Text backgroundColor="#1c1c1c">
      <Text color="yellow" bold>{'>'}</Text>
      <Text color="white"> {before}</Text>
      <Text color="yellow">█</Text>
      <Text color="white">{after}</Text>
      <Text>{' '.repeat(padLen)}</Text>
    </Text>
  );
}
