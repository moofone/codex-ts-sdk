import type { PartialCodexLogger } from '../utils/logger';
export declare function resolveModuleUrl(fnCtor?: typeof Function, dir?: string): string;
export declare function normalizeDirectory(dir: unknown): string | undefined;
export interface NativeCodexOptions {
    codexHome?: string;
}
export interface ConfigOverrideEntry {
    key: string;
    value: string;
}
export interface CreateConversationOptions {
    overrides?: ConfigOverrideEntry[];
}
export interface CodexSessionHandle {
    conversationId: string;
    nextEvent(): Promise<string | null>;
    submit(submissionJson: string): Promise<void>;
    close(): Promise<void>;
}
export interface NativeCodexBinding {
    new (options?: NativeCodexOptions): NativeCodexInstance;
}
export interface NativeCodexInstance {
    createConversation(options?: CreateConversationOptions): Promise<CodexSessionHandle>;
    getAuthMode?(): string | null;
}
export interface CodexNativeModule {
    NativeCodex: NativeCodexBinding;
    version(): string;
    cliVersion(): string;
}
export interface LoadNativeModuleOptions {
    modulePath?: string;
    logger?: PartialCodexLogger;
    projectRootOverride?: string;
}
export declare function loadNativeModule(options?: LoadNativeModuleOptions): CodexNativeModule;
export declare function formatOverrides(overrides?: Record<string, string>): ConfigOverrideEntry[] | undefined;
