import { homedir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRuntimeConfig, applyProfile, type RuntimeSelections } from './runtime-config.js';

const PROFILES_DIR = resolve(homedir(), '.config', 'shodan-assistant');
const PROFILES_FILE = resolve(PROFILES_DIR, 'profiles.json');

interface ProfileStore {
  [name: string]: RuntimeSelections;
}

function ensureDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function readStore(): ProfileStore {
  ensureDir();
  try {
    return JSON.parse(readFileSync(PROFILES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeStore(store: ProfileStore): void {
  ensureDir();
  writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function saveProfile(name: string): string {
  const store = readStore();
  store[name] = JSON.parse(JSON.stringify(getRuntimeConfig()));
  writeStore(store);
  return `Profile "${name}" saved`;
}

export function loadProfile(name: string): string {
  const store = readStore();
  const sel = store[name];
  if (!sel) return `Profile "${name}" not found`;
  applyProfile(sel);
  return `Profile "${name}" loaded`;
}

export function listProfiles(): string[] {
  return Object.keys(readStore()).sort();
}

export function deleteProfile(name: string): string {
  const store = readStore();
  if (!store[name]) return `Profile "${name}" not found`;
  delete store[name];
  writeStore(store);
  return `Profile "${name}" deleted`;
}
