import {
  type ProviderKind,
  LLM_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  TTS_PROVIDER_OPTIONS,
  applySwitch,
  getRuntimeConfig,
} from './runtime-config.js';

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
          '/help     \u2014 Show this help',
          '/provider \u2014 Switch LLM / STT / TTS provider and model',
          '/llm      \u2014 Switch LLM provider or model',
          '/stt      \u2014 Switch STT provider',
          '/tts      \u2014 Switch TTS provider',
          '/model    \u2014 Switch model for current LLM provider',
          '/quit     \u2014 Exit',
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

function buildProviderMenu(kind: ProviderKind): MenuDef {
  const options = getProviderOptions(kind);
  return {
    title: `Select ${kind.toUpperCase()} provider`,
    items: options.map((p) => ({ id: p.id, label: p.label })),
    onSelect: (i) => {
      const provider = options[i];
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
