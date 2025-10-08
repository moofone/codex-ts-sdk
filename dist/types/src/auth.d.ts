/// <reference types="node" />
import { existsSync, writeFileSync } from 'fs';
import type { CodexClientConfig } from './types/options';
type FileSystemOverrides = {
    existsSync: typeof existsSync;
    writeFileSync: typeof writeFileSync;
};
export type LoginWithApiKeyOptions = Pick<CodexClientConfig, 'codexHome'> & {
    fs?: FileSystemOverrides;
};
export declare function loginWithApiKey(apiKey: string, options?: LoginWithApiKeyOptions): void;
export {};
