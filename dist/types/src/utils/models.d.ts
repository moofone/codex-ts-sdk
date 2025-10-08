import type { ReasoningEffort } from '../bindings/ReasoningEffort';
export interface ModelMetadata {
    canonical: string;
    supportedEfforts: ReasoningEffort[];
    defaultEffort: ReasoningEffort;
    aliases?: string[];
}
export interface ResolvedModelVariant {
    model: string;
    effort?: ReasoningEffort;
}
export declare function resolveModelVariant(model: string, requestedEffort?: ReasoningEffort): ResolvedModelVariant;
export declare function getSupportedEfforts(model: string): ReasoningEffort[];
