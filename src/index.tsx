#!/usr/bin/env tsx

import React from 'react';
import { render } from 'ink';
import { parseArgs } from 'node:util';
import App from './app.js';

const { values } = parseArgs({
  options: {
    intro:    { type: 'string' },
    gap:      { type: 'string' },
    silent:   { type: 'boolean', default: false },
    'no-warmup': { type: 'boolean', default: false },
    help:     { type: 'boolean', default: false, short: 'h' },
  },
  strict: false,
});

if (values.help) {
  console.log(`
shodan-assistant \u2014 Voice AI Agent with Terminal UI

Usage: tsx src/index.tsx [options]

Options:
  --intro TEXT     Override startup greeting
  --gap SECONDS    Silence between response chunks (default: 1.2)
  --silent         Log only, no TTS output
  --no-warmup      Skip ASR/TTS warmup
  -h, --help       Show this help
`);
  process.exit(0);
}

const { waitUntilExit } = render(
  <App
    intro={typeof values.intro === 'string' ? values.intro : undefined}
    gap={typeof values.gap === 'string' ? parseFloat(values.gap) : undefined}
    silent={values.silent === true}
    noWarmup={values['no-warmup'] === true}
  />,
);

await waitUntilExit();
