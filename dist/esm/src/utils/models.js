const MODEL_REGISTRY = [
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
const MODEL_INDEX = new Map();
for (const entry of MODEL_REGISTRY) {
    MODEL_INDEX.set(entry.canonical, entry);
    for (const alias of entry.aliases ?? []) {
        MODEL_INDEX.set(alias, entry);
    }
}
export function resolveModelVariant(model, requestedEffort) {
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
export function getSupportedEfforts(model) {
    const normalized = model.trim().toLowerCase();
    const metadata = MODEL_INDEX.get(model) ?? MODEL_INDEX.get(normalized);
    return metadata ? [...metadata.supportedEfforts] : ['minimal', 'low', 'medium', 'high'];
}
//# sourceMappingURL=models.js.map