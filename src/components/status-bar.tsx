import React from 'react';
import { Box, Text } from 'ink';
import type { Status } from '../lib/types.js';

const STATUS_LABELS: Record<Status, { label: string; color: string }> = {
  starting:    { label: 'Starting…',     color: 'yellow' },
  listening:   { label: 'Listening',     color: 'green' },
  transcribing:{ label: 'Transcribing',  color: 'yellow' },
  thinking:    { label: 'Thinking',      color: 'cyan' },
  speaking:    { label: 'Speaking',      color: 'magenta' },
  idle:        { label: 'Idle',          color: 'gray' },
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function useSpinner(): string {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setFrame((i) => (i + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return SPINNER_FRAMES[frame];
}

interface Props {
  status: Status;
  rightLabel?: string;
}

export default function StatusBar({ status, rightLabel }: Props) {
  const spinner = useSpinner();
  const cfg = STATUS_LABELS[status];
  const showSpinner = status !== 'idle' && status !== 'listening';

  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={cfg.color} bold>
          {showSpinner ? `${spinner} ` : '○ '}{cfg.label}
        </Text>
        <Text color="gray"> — Shodan Voice Agent</Text>
      </Box>
      <Box flexGrow={1} justifyContent="flex-end">
        {rightLabel && (
          <Text color="gray" italic>
            {rightLabel}
          </Text>
        )}
      </Box>
    </Box>
  );
}
