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
export class ConversationNotFoundError extends Error {
  public readonly conversationId: string;

  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = 'ConversationNotFoundError';
    this.conversationId = conversationId;
  }
}

/**
 * Error thrown when maximum conversations limit is exceeded
 */
export class MaxConversationsExceededError extends Error {
  public readonly maxConversations: number;
  public readonly currentCount: number;

  constructor(maxConversations: number, currentCount: number) {
    super(`Maximum conversations exceeded: ${currentCount}/${maxConversations}`);
    this.name = 'MaxConversationsExceededError';
    this.maxConversations = maxConversations;
    this.currentCount = currentCount;
  }
}

/**
 * Base error for conversation manager operations
 */
export class ConversationManagerError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ConversationManagerError';
    this.cause = cause;
  }
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