import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  logs: string[];
}

export default function LogPanel({ logs }: Props) {
  const last = logs.length > 0 ? logs[logs.length - 1] : '';

  return (
    <Box>
      <Text color="gray" wrap="truncate-end">
        {last || 'Ready'}
      </Text>
    </Box>
  );
}
