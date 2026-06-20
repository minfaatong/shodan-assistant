import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  buffer: string;
  cursor: number;
}

export default function CommandInput({ buffer, cursor }: Props) {
  const before = buffer.slice(0, cursor);
  const after = buffer.slice(cursor);
  return (
    <Box>
      <Text color="yellow" bold>{'>'}</Text>
      <Text color="white"> {before}</Text>
      <Text color="yellow">█</Text>
      <Text color="white">{after}</Text>
    </Box>
  );
}
