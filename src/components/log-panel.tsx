import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  logs: string[];
  maxLines: number;
}

export default function LogPanel({ logs, maxLines }: Props) {
  const visible = logs.slice(-maxLines);

  if (visible.length === 0) {
    return (
      <Box>
        <Text color="gray">Ready</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {visible.map((line, i) => (
        <Text key={i} color="gray" wrap="truncate-end">
          {line}
        </Text>
      ))}
    </Box>
  );
}
