import {
  type ProviderKind,
  LLM_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  TTS_PROVIDER_OPTIONS,
  applySwitch,
  getRuntimeConfig,
  getApiKey,
  setApiKey,
  resetRuntimeConfig,
} from './runtime-config.js';
import { saveProfile, loadProfile, listProfiles, deleteProfile } from './profiles.js';

export interface MenuItem {
  id: string;
  label: string;
}

export interface MenuDef {
  title: string;
  items: MenuItem[];
  onSelect: (index: number) => CommandResult;
}

export type CommandResult =
  | { type: 'done'; message: string }
  | { type: 'menu'; menu: MenuDef }
  | { type: 'keyinput'; prompt: string; onSubmit: (value: string) => CommandResult }
  | { type: 'quit' };

export function parseCommand(buffer: string): CommandResult {
  const trimmed = buffer.trim();
  const name = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
  const rest = trimmed.slice(name.length + 1).trim();

  switch (name) {
    case 'help': {
      return {
        type: 'done',
        message: [
          '/help          \u2014 Show this help',
          '/provider      \u2014 Switch LLM / STT / TTS provider and model',
          '/llm           \u2014 Switch LLM provider or model',
          '/stt           \u2014 Switch STT provider',
          '/tts           \u2014 Switch TTS provider',
          '/model         \u2014 Switch model for current LLM provider',
          '/key <api_key> \u2014 Set API key for current provider',
          '/profile       \u2014 Save/load profiles',
          '/default       \u2014 Reset all to defaults',
          '/quit          \u2014 Exit',
        ].join('\n'),
      };
    }

    case 'provider':
    case 'providers':
      return {
        type: 'menu',
        menu: {
          title: 'Select category',
          items: [
            { id: 'llm', label: 'LLM \u2014 Language Model' },
            { id: 'stt', label: 'STT \u2014 Speech to Text' },
            { id: 'tts', label: 'TTS \u2014 Text to Speech' },
          ],
          onSelect: (i) => ({ type: 'menu', menu: buildProviderMenu(['llm', 'stt', 'tts'][i] as ProviderKind) }),
        },
      };

    case 'llm':
      return { type: 'menu', menu: buildProviderMenu('llm') };

    case 'stt':
      return { type: 'menu', menu: buildProviderMenu('stt') };

    case 'tts':
      return { type: 'menu', menu: buildProviderMenu('tts') };

    case 'model': {
      const cfg = getRuntimeConfig();
      const kind = rest
        ? (['llm', 'stt', 'tts'].includes(rest) ? rest as ProviderKind : 'llm')
        : 'llm';
      const providerId = cfg[kind].provider;
      return buildModelMenu(kind, providerId);
    }

    case 'key': {
      const cfg = getRuntimeConfig();
      const kind = rest
        ? (['llm', 'stt', 'tts'].includes(rest) ? rest as ProviderKind : 'llm')
        : 'llm';
      const key = kind === rest ? '' : rest.split(/\s+/).slice(1).join(' ');
      if (key) {
        setApiKey(kind, key);
        return { type: 'done', message: `API key set for ${kind.toUpperCase()}` };
      }
      return {
        type: 'keyinput',
        prompt: `Set API key for ${kind.toUpperCase()}:`,
        onSubmit: (value) => {
          setApiKey(kind, value);
          return { type: 'done', message: `API key set for ${kind.toUpperCase()}` };
        },
      };
    }

    case 'profile':
    case 'profiles':
      return buildProfileMenu();

    case 'default':
    case 'reset':
      resetRuntimeConfig();
      return { type: 'done', message: 'All settings reset to defaults' };

    case 'quit':
    case 'exit':
      return { type: 'quit' };

    default:
      return { type: 'done', message: `Unknown command: /${name}. Try /help` };
  }
}

function getProviderOptions(kind: ProviderKind) {
  switch (kind) {
    case 'llm': return LLM_PROVIDER_OPTIONS;
    case 'stt': return STT_PROVIDER_OPTIONS;
    case 'tts': return TTS_PROVIDER_OPTIONS;
  }
}

function needsApiKey(kind: ProviderKind, providerId: string): boolean {
  const cloudKeys = ['openrouter', 'openai', 'cloudflare', 'deepseek', 'google'];
  if (!cloudKeys.includes(providerId)) return false;
  if (getApiKey(kind)) return false;
  return true;
}

function buildProviderMenu(kind: ProviderKind): MenuDef {
  const options = getProviderOptions(kind);
  return {
    title: `Select ${kind.toUpperCase()} provider`,
    items: options.map((p) => ({ id: p.id, label: p.label })),
    onSelect: (i) => {
      const provider = options[i];
      if (needsApiKey(kind, provider.id)) {
        return {
          type: 'keyinput',
          prompt: `API key for ${provider.label}:`,
          onSubmit: (key) => {
            setApiKey(kind, key);
            if (provider.models && provider.models.length > 0) {
              return buildModelMenuAfterKey(kind, provider.id, provider.label, provider.models);
            }
            applySwitch({ kind, provider: provider.id });
            return { type: 'done', message: `Switched ${kind.toUpperCase()} to ${provider.label}` };
          },
        };
      }
      if (provider.models && provider.models.length > 0) {
        return {
          type: 'menu',
          menu: {
            title: `Select model for ${provider.label}`,
            items: provider.models.map((m) => ({ id: m.id, label: m.label })),
            onSelect: (mi) => {
              const model = provider.models![mi];
              applySwitch({
                kind,
                provider: provider.id,
                model: model.id === 'auto' ? undefined : model.id,
              });
              return { type: 'done', message: `Switched ${kind.toUpperCase()} to ${provider.label} (${model.label})` };
            },
          },
        };
      }
      applySwitch({ kind, provider: provider.id });
      return { type: 'done', message: `Switched ${kind.toUpperCase()} to ${provider.label}` };
    },
  };
}

function buildModelMenuAfterKey(kind: ProviderKind, providerId: string, providerLabel: string, models: { id: string; label: string }[]): CommandResult {
  return {
    type: 'menu',
    menu: {
      title: `Select model for ${providerLabel}`,
      items: models.map((m) => ({ id: m.id, label: m.label })),
      onSelect: (mi) => {
        const model = models[mi];
        applySwitch({
          kind,
          provider: providerId,
          model: model.id === 'auto' ? undefined : model.id,
        });
        return { type: 'done', message: `Switched ${kind.toUpperCase()} to ${providerLabel} (${model.label})` };
      },
    },
  };
}

function buildModelMenu(kind: ProviderKind, providerId: string): CommandResult {
  const options = getProviderOptions(kind);
  const provider = options.find((p) => p.id === providerId);
  if (!provider?.models || provider.models.length === 0) {
    return { type: 'done', message: `No selectable models for ${provider?.label ?? providerId}` };
  }
  return {
    type: 'menu',
    menu: {
      title: `Select ${kind.toUpperCase()} model`,
      items: provider.models.map((m) => ({ id: m.id, label: m.label })),
      onSelect: (mi) => {
        const model = provider.models![mi];
        applySwitch({ kind, provider: providerId, model: model.id === 'auto' ? undefined : model.id });
        return { type: 'done', message: `Switched model to ${model.label}` };
      },
    },
  };
}

function buildProfileMenu(): CommandResult {
  const profiles = listProfiles();
  const items: MenuItem[] = [
    { id: 'save', label: 'Save current as profile' },
  ];
  if (profiles.length > 0) {
    items.push({ id: 'load', label: 'Load a profile' });
    items.push({ id: 'delete', label: 'Delete a profile' });
  }
  items.push({ id: 'default', label: 'Reset all to defaults' });

  return {
    type: 'menu',
    menu: {
      title: 'Profiles',
      items,
      onSelect: (i) => {
        const id = items[i].id;
        switch (id) {
          case 'save':
            return {
              type: 'keyinput',
              prompt: 'Profile name:',
              onSubmit: (name) => {
                if (!name) return { type: 'done', message: 'Cancelled' };
                return { type: 'done', message: saveProfile(name) };
              },
            };
          case 'load':
            return {
              type: 'menu',
              menu: {
                title: 'Select profile to load',
                items: profiles.map((p) => ({ id: p, label: p })),
                onSelect: (pi) => ({ type: 'done', message: loadProfile(profiles[pi]) }),
              },
            };
          case 'delete':
            return {
              type: 'menu',
              menu: {
                title: 'Select profile to delete',
                items: profiles.map((p) => ({ id: p, label: p })),
                onSelect: (pi) => ({ type: 'done', message: deleteProfile(profiles[pi]) }),
              },
            };
          case 'default':
            resetRuntimeConfig();
            return { type: 'done', message: 'All settings reset to defaults' };
          default:
            return { type: 'done', message: 'Cancelled' };
        }
      },
    },
  };
}
