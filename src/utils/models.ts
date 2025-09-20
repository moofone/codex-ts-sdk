import type { ReasoningEffort } from '../bindings/ReasoningEffort';

export interface ModelMetadata {
  canonical: string;
  supportedEfforts: ReasoningEffort[];
  defaultEffort: ReasoningEffort;
  aliases?: string[];
}

const MODEL_REGISTRY: ModelMetadata[] = [
  {
    canonical: 'gpt-5-codex',
    supportedEfforts: ['minimal', 'low', 'medium', 'high'],
    defaultEffort: 'medium',
    aliases: ['codex', 'codex-native', 'gpt-5'],
  },
  {
    canonical: 'gpt-5-codex-latest',
    supportedEfforts: ['minimal', 'low', 'medium', 'high'],
    defaultEffort: 'high',
  },
];

const MODEL_INDEX = new Map<string, ModelMetadata>();
for (const entry of MODEL_REGISTRY) {
  MODEL_INDEX.set(entry.canonical, entry);
  for (const alias of entry.aliases ?? []) {
    MODEL_INDEX.set(alias, entry);
  }
}

export interface ResolvedModelVariant {
  model: string;
  effort?: ReasoningEffort;
}

export function resolveModelVariant(model: string, requestedEffort?: ReasoningEffort): ResolvedModelVariant {
  const trimmed = model.trim();
  const metadata = MODEL_INDEX.get(trimmed) ?? MODEL_INDEX.get(trimmed.toLowerCase());

  if (!metadata) {
    return { model: trimmed, effort: requestedEffort };
  }

  const effort = requestedEffort && metadata.supportedEfforts.includes(requestedEffort)
    ? requestedEffort
    : metadata.defaultEffort;

  return {
    model: metadata.canonical,
    effort,
  };
}

export function getSupportedEfforts(model: string): ReasoningEffort[] {
  const normalized = model.trim().toLowerCase();
  const metadata = MODEL_INDEX.get(model) ?? MODEL_INDEX.get(normalized);
  return metadata ? [...metadata.supportedEfforts] : ['minimal', 'low', 'medium', 'high'];
}
