import { EventEmitter } from 'events';
import { CodexClientBuilder } from './CodexClientBuilder';
import { ConversationNotFoundError, ConversationManagerError, MaxConversationsExceededError, } from '../types/conversation';
/**
 * Utility function for logging
 */
function log(logger, level, message, meta) {
    if (logger && logger[level]) {
        logger[level](message, meta);
    }
}
/**
 * Manages multiple Codex conversations with lifecycle orchestration
 */
export class ConversationManager extends EventEmitter {
    config;
    conversations = new Map();
    inactivityTimers = new Map();
    isShuttingDown = false;
    constructor(config = {}) {
        super();
        this.config = {
            maxConversations: config.maxConversations ?? 10,
            defaultClientConfig: config.defaultClientConfig ?? {},
            inactivityTimeout: config.inactivityTimeout ?? 300_000, // 5 minutes
            logger: config.logger ?? {},
        };
        log(this.config.logger, 'info', 'ConversationManager initialized', {
            maxConversations: this.config.maxConversations,
            inactivityTimeout: this.config.inactivityTimeout,
        });
    }
    /**
     * Create a new conversation
     */
    async createConversation(options = {}) {
        if (this.isShuttingDown) {
            throw new ConversationManagerError('Manager is shutting down');
        }
        if (this.conversations.size >= this.config.maxConversations) {
            throw new MaxConversationsExceededError(this.config.maxConversations, this.conversations.size);
        }
        try {
            // Build client with merged configuration
            const clientConfig = {
                ...this.config.defaultClientConfig,
                ...options.config,
            };
            const client = new CodexClientBuilder()
                .withConfig(clientConfig)
                .build();
            // Connect if requested
            if (options.autoConnect !== false) {
                await client.connect();
            }
            // Create conversation
            const actualConversationId = options.conversationId ?? await client.createConversation();
            const storedConversationId = this.ensureUniqueConversationId(actualConversationId);
            // Store conversation info
            const conversationInfo = {
                conversationId: storedConversationId,
                client,
                createdAt: new Date(),
                lastActivity: new Date(),
                isActive: true,
            };
            this.conversations.set(storedConversationId, conversationInfo);
            this.setupInactivityTimer(storedConversationId);
            this.setupClientEventHandlers(storedConversationId, client);
            log(this.config.logger, 'info', 'Conversation created', {
                conversationId: storedConversationId,
                totalConversations: this.conversations.size,
            });
            this.emit('conversationCreated', {
                conversationId: storedConversationId,
                client,
            });
            return {
                conversationId: storedConversationId,
                client,
            };
        }
        catch (error) {
            throw new ConversationManagerError('Failed to create conversation', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Get an existing conversation
     */
    getConversation(conversationId) {
        const conversationInfo = this.conversations.get(conversationId);
        if (!conversationInfo) {
            return Promise.reject(new ConversationNotFoundError(conversationId));
        }
        log(this.config.logger, 'debug', 'Conversation retrieved', {
            conversationId,
            isActive: conversationInfo.isActive,
        });
        // Update last activity
        conversationInfo.lastActivity = new Date();
        this.resetInactivityTimer(conversationId);
        return Promise.resolve(conversationInfo.client);
    }
    /**
     * Remove a conversation from management
     */
    async removeConversation(conversationId) {
        const conversationInfo = this.conversations.get(conversationId);
        if (!conversationInfo) {
            return false;
        }
        try {
            // Clean up timers
            this.clearInactivityTimer(conversationId);
            // Close the client
            await conversationInfo.client.close();
            // Remove from tracking
            this.conversations.delete(conversationId);
            log(this.config.logger, 'info', 'Conversation removed', {
                conversationId,
                remainingConversations: this.conversations.size,
            });
            this.emit('conversationRemoved', { conversationId });
            return true;
        }
        catch (error) {
            log(this.config.logger, 'error', 'Failed to remove conversation', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new ConversationManagerError(`Failed to remove conversation ${conversationId}`, error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Resume a conversation from rollout data
     */
    async resumeConversationFromRollout(rolloutData, baseConfig = {}, options = {}) {
        if (this.isShuttingDown) {
            throw new ConversationManagerError('Manager is shutting down');
        }
        if (this.conversations.size >= this.config.maxConversations) {
            throw new MaxConversationsExceededError(this.config.maxConversations, this.conversations.size);
        }
        try {
            // Import ConversationResumer here to avoid circular dependency
            const { ConversationResumer } = await import('../persistence/ConversationResumer');
            const resumer = new ConversationResumer();
            // Merge configurations
            const clientConfig = {
                ...this.config.defaultClientConfig,
                ...baseConfig,
                ...options.config,
            };
            const conversationId = await resumer.resumeConversationWithHistory(rolloutData, clientConfig, options);
            // The resumer creates and connects the client internally
            // We need to get a reference to it for management
            const client = new CodexClientBuilder()
                .withConfig(clientConfig)
                .build();
            await client.connect();
            const storedConversationId = this.ensureUniqueConversationId(conversationId);
            // Store conversation info
            const conversationInfo = {
                conversationId: storedConversationId,
                client,
                createdAt: new Date(),
                lastActivity: new Date(),
                isActive: true,
            };
            this.conversations.set(storedConversationId, conversationInfo);
            this.setupInactivityTimer(storedConversationId);
            this.setupClientEventHandlers(storedConversationId, client);
            log(this.config.logger, 'info', 'Conversation resumed from rollout', {
                conversationId: storedConversationId,
                eventCount: rolloutData.events.length,
                sessionId: rolloutData.session.id,
            });
            this.emit('conversationResumed', {
                conversationId: storedConversationId,
                client,
                rolloutData,
            });
            return { conversationId: storedConversationId, client };
        }
        catch (error) {
            throw new ConversationManagerError('Failed to resume conversation from rollout', error instanceof Error ? error : new Error(String(error)));
        }
    }
    ensureUniqueConversationId(baseId) {
        if (!this.conversations.has(baseId)) {
            return baseId;
        }
        let index = 2;
        let candidate = `${baseId}-${index}`;
        while (this.conversations.has(candidate)) {
            index += 1;
            candidate = `${baseId}-${index}`;
        }
        return candidate;
    }
    /**
     * Resume a conversation from a rollout file
     */
    async resumeConversationFromFile(filePath, baseConfig = {}, options = {}) {
        try {
            // Import file operations here to avoid circular dependency
            const { readRolloutFile } = await import('../utils/fileOperations');
            const rolloutData = await readRolloutFile(filePath);
            return this.resumeConversationFromRollout(rolloutData, baseConfig, options);
        }
        catch (error) {
            throw new ConversationManagerError(`Failed to resume conversation from file: ${filePath}`, error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * List all managed conversations
     */
    listConversations() {
        return Array.from(this.conversations.values()).map(info => ({
            conversationId: info.conversationId,
            createdAt: info.createdAt,
            lastActivity: info.lastActivity,
            isActive: info.isActive,
        }));
    }
    /**
     * Get conversation statistics
     */
    getStats() {
        const conversations = Array.from(this.conversations.values());
        const activeCount = conversations.filter(c => c.isActive).length;
        const dates = conversations.map(c => c.createdAt);
        const oldest = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : undefined;
        const newest = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined;
        return {
            totalConversations: this.conversations.size,
            activeConversations: activeCount,
            maxConversations: this.config.maxConversations,
            oldestConversation: oldest,
            newestConversation: newest,
        };
    }
    /**
     * Shutdown all conversations and cleanup
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;
        log(this.config.logger, 'info', 'Shutting down ConversationManager', {
            conversationsToClose: this.conversations.size,
        });
        // Clear all timers
        for (const conversationId of this.conversations.keys()) {
            this.clearInactivityTimer(conversationId);
        }
        // Close all conversations in parallel
        const closePromises = Array.from(this.conversations.values()).map(async (info) => {
            try {
                await info.client.close();
                log(this.config.logger, 'debug', 'Conversation closed', {
                    conversationId: info.conversationId,
                });
            }
            catch (error) {
                log(this.config.logger, 'warn', 'Failed to close conversation cleanly', {
                    conversationId: info.conversationId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
        await Promise.allSettled(closePromises);
        // Clear conversation tracking
        this.conversations.clear();
        log(this.config.logger, 'info', 'ConversationManager shutdown complete');
        this.emit('shutdown');
    }
    /**
     * Setup inactivity timer for a conversation
     */
    setupInactivityTimer(conversationId) {
        this.clearInactivityTimer(conversationId);
        const timer = setTimeout(() => {
            this.handleInactiveConversation(conversationId);
        }, this.config.inactivityTimeout);
        this.inactivityTimers.set(conversationId, timer);
    }
    /**
     * Reset inactivity timer for a conversation
     */
    resetInactivityTimer(conversationId) {
        this.setupInactivityTimer(conversationId);
    }
    /**
     * Clear inactivity timer for a conversation
     */
    clearInactivityTimer(conversationId) {
        const timer = this.inactivityTimers.get(conversationId);
        if (timer) {
            clearTimeout(timer);
            this.inactivityTimers.delete(conversationId);
        }
    }
    /**
     * Handle inactive conversation cleanup
     */
    handleInactiveConversation(conversationId) {
        const conversationInfo = this.conversations.get(conversationId);
        if (!conversationInfo) {
            return;
        }
        log(this.config.logger, 'info', 'Cleaning up inactive conversation', {
            conversationId,
            lastActivity: conversationInfo.lastActivity,
        });
        conversationInfo.isActive = false;
        this.emit('conversationInactive', {
            conversationId,
            lastActivity: conversationInfo.lastActivity,
        });
        // Optionally auto-remove inactive conversations
        // For now, just mark as inactive but keep the client alive
    }
    /**
     * Setup event handlers for a client
     */
    setupClientEventHandlers(conversationId, client) {
        // Update activity on any client event
        client.on('event', () => {
            const conversationInfo = this.conversations.get(conversationId);
            if (conversationInfo) {
                conversationInfo.lastActivity = new Date();
                this.resetInactivityTimer(conversationId);
            }
        });
        const handleClosure = () => {
            log(this.config.logger, 'debug', 'Client closed', { conversationId });
            this.clearInactivityTimer(conversationId);
        };
        // Handle client closure
        client.on('eventStreamClosed', handleClosure);
        // Handle client errors
        client.on('error', (error) => {
            log(this.config.logger, 'error', 'Client error', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
            });
            this.emit('conversationError', {
                conversationId,
                error,
            });
        });
    }
}
//# sourceMappingURL=ConversationManager.js.map