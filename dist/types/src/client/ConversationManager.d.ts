/// <reference types="node" />
import { EventEmitter } from 'events';
import type { CodexClient } from './CodexClient';
import type { RolloutData } from '../types/rollout';
import type { ConversationManagerConfig, CreateConversationOptions, ResumeConversationOptions } from '../types/conversation';
import type { CodexClientConfig } from '../types/options';
/**
 * Manages multiple Codex conversations with lifecycle orchestration
 */
export declare class ConversationManager extends EventEmitter {
    private readonly config;
    private readonly conversations;
    private readonly inactivityTimers;
    private isShuttingDown;
    constructor(config?: ConversationManagerConfig);
    /**
     * Create a new conversation
     */
    createConversation(options?: CreateConversationOptions): Promise<{
        conversationId: string;
        client: CodexClient;
    }>;
    /**
     * Get an existing conversation
     */
    getConversation(conversationId: string): Promise<CodexClient>;
    /**
     * Remove a conversation from management
     */
    removeConversation(conversationId: string): Promise<boolean>;
    /**
     * Resume a conversation from rollout data
     */
    resumeConversationFromRollout(rolloutData: RolloutData, baseConfig?: Partial<CodexClientConfig>, options?: ResumeConversationOptions): Promise<{
        conversationId: string;
        client: CodexClient;
    }>;
    private ensureUniqueConversationId;
    /**
     * Resume a conversation from a rollout file
     */
    resumeConversationFromFile(filePath: string, baseConfig?: Partial<CodexClientConfig>, options?: ResumeConversationOptions): Promise<{
        conversationId: string;
        client: CodexClient;
    }>;
    /**
     * List all managed conversations
     */
    listConversations(): Array<{
        conversationId: string;
        createdAt: Date;
        lastActivity: Date;
        isActive: boolean;
    }>;
    /**
     * Get conversation statistics
     */
    getStats(): {
        totalConversations: number;
        activeConversations: number;
        maxConversations: number;
        oldestConversation?: Date;
        newestConversation?: Date;
    };
    /**
     * Shutdown all conversations and cleanup
     */
    shutdown(): Promise<void>;
    /**
     * Setup inactivity timer for a conversation
     */
    private setupInactivityTimer;
    /**
     * Reset inactivity timer for a conversation
     */
    private resetInactivityTimer;
    /**
     * Clear inactivity timer for a conversation
     */
    private clearInactivityTimer;
    /**
     * Handle inactive conversation cleanup
     */
    private handleInactiveConversation;
    /**
     * Setup event handlers for a client
     */
    private setupClientEventHandlers;
}
