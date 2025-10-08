import { CodexClient } from './CodexClient';
import type { CodexClientConfig } from '../types/options';
export declare class CodexClientPool {
    private readonly config;
    private readonly maxSize;
    private readonly idle;
    private readonly busy;
    private readonly waiters;
    private size;
    constructor(config: CodexClientConfig, maxSize?: number);
    acquire(): Promise<CodexClient>;
    release(client: CodexClient): void;
    withClient<T>(callback: (client: CodexClient) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
