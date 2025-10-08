import type { CodexClient } from '../client/CodexClient';
import type { CodexClientConfig } from './options';
/**
 * Information about a managed conversation
 */
export interface ConversationInfo {
    conversationId: string;
    client: CodexClient;
    createdAt: Date;
    lastActivity: Date;
    isActive: boolean;
}
/**
 * Configuration for the ConversationManager
 */
export interface ConversationManagerConfig {
    /**
     * Maximum number of concurrent conversations
     * @default 10
     */
    maxConversations?: number;
    /**
     * Default configuration for new conversations
     */
    defaultClientConfig?: Partial<CodexClientConfig>;
    /**
     * Auto-cleanup inactive conversations after this duration (ms)
     * @default 300000 (5 minutes)
     */
    inactivityTimeout?: number;
    /**
     * Logger for conversation manager operations
     */
    logger?: {
        debug?: (message: string, meta?: Record<string, unknown>) => void;
        info?: (message: string, meta?: Record<string, unknown>) => void;
        warn?: (message: string, meta?: Record<string, unknown>) => void;
        error?: (message: string, meta?: Record<string, unknown>) => void;
    };
}
/**
 * Error thrown when conversation is not found
 */
export declare class ConversationNotFoundError extends Error {
    readonly conversationId: string;
    constructor(conversationId: string);
}
/**
 * Error thrown when maximum conversations limit is exceeded
 */
export declare class MaxConversationsExceededError extends Error {
    readonly maxConversations: number;
    readonly currentCount: number;
    constructor(maxConversations: number, currentCount: number);
}
/**
 * Base error for conversation manager operations
 */
export declare class ConversationManagerError extends Error {
    readonly cause?: Error;
    constructor(message: string, cause?: Error);
}
/**
 * Options for creating a new conversation
 */
export interface CreateConversationOptions {
    /**
     * Specific conversation ID to use (otherwise auto-generated)
     */
    conversationId?: string;
    /**
     * Configuration overrides for this conversation
     */
    config?: Partial<CodexClientConfig>;
    /**
     * Whether to automatically connect the conversation
     * @default true
     */
    autoConnect?: boolean;
}
/**
 * Options for resuming a conversation
 */
export interface ResumeConversationOptions {
    /**
     * Configuration overrides for the resumed conversation
     */
    config?: Partial<CodexClientConfig>;
    /**
     * Whether to validate rollout data before resumption
     * @default true
     */
    validateRollout?: boolean;
    /**
     * Whether to skip side-effect operations during replay
     * @default true
     */
    skipSideEffects?: boolean;
    /**
     * Maximum time to wait for resumption (ms)
     * @default 30000
     */
    timeoutMs?: number;
}
