import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  buffer: string;
}

export default function CommandInput({ buffer }: Props) {
  return (
    <Box>
      <Text color="yellow" bold>{'>'}</Text>
      <Text color="white"> {buffer}</Text>
      <Text color="yellow">█</Text>
    </Box>
  );
}
