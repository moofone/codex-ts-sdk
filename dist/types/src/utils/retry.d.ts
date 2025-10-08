import type { PartialCodexLogger } from './logger';
export interface RetryPolicy {
    maxRetries: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    maxDelayMs?: number;
}
export declare function withRetry<T>(operation: () => Promise<T>, policy: RetryPolicy | undefined, logger?: PartialCodexLogger, label?: string): Promise<T>;
