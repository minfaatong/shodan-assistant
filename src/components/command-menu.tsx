import React from 'react';
import { Box, Text } from 'ink';
import type { MenuDef } from '../lib/commands.js';

interface Props {
  def: MenuDef;
  cursor: number;
}

export default function CommandMenu({ def, cursor }: Props) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Text color="green" bold>{def.title}</Text>
      {def.items.map((item, i) => (
        <Box key={item.id}>
          <Text color={i === cursor ? 'cyan' : 'gray'}>
            {i === cursor ? '\u203A ' : '  '}
          </Text>
          <Text color={i === cursor ? 'white' : 'gray'}>
            {item.label}
          </Text>
        </Box>
      ))}
      <Text color="gray" dimColor>
        \u2191\u2193 navigate  \u23ce select  Esc cancel
      </Text>
    </Box>
  );
}
