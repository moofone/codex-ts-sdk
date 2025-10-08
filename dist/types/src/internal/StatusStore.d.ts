import type { StatusResponse } from '../types/options';
import type { SessionConfiguredEventMessage, TaskCompleteEventMessage, TaskStartedEventMessage, TokenCountEventMessage } from '../types/events';
/**
 * Tracks the latest status information emitted by the runtime.
 */
export declare class StatusStore {
    private rateLimits?;
    private tokenUsage?;
    private lastUpdated?;
    private sessionId?;
    private model?;
    private reasoningEffort?;
    private historyLogId?;
    private historyEntryCount?;
    private rolloutPath?;
    private lastAgentMessage?;
    private modelContextWindow?;
    updateFromTokenCountEvent(event: TokenCountEventMessage): void;
    updateSessionInfo(event: SessionConfiguredEventMessage): void;
    updateFromTaskStartedEvent(event: TaskStartedEventMessage): void;
    updateFromTaskCompleteEvent(event: TaskCompleteEventMessage): void;
    getStatus(): StatusResponse;
    clear(): void;
    private buildRateLimitWindows;
}
