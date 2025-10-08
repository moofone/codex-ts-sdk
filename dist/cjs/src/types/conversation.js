"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationManagerError = exports.MaxConversationsExceededError = exports.ConversationNotFoundError = void 0;
/**
 * Error thrown when conversation is not found
 */
class ConversationNotFoundError extends Error {
    conversationId;
    constructor(conversationId) {
        super(`Conversation not found: ${conversationId}`);
        this.name = 'ConversationNotFoundError';
        this.conversationId = conversationId;
    }
}
exports.ConversationNotFoundError = ConversationNotFoundError;
/**
 * Error thrown when maximum conversations limit is exceeded
 */
class MaxConversationsExceededError extends Error {
    maxConversations;
    currentCount;
    constructor(maxConversations, currentCount) {
        super(`Maximum conversations exceeded: ${currentCount}/${maxConversations}`);
        this.name = 'MaxConversationsExceededError';
        this.maxConversations = maxConversations;
        this.currentCount = currentCount;
    }
}
exports.MaxConversationsExceededError = MaxConversationsExceededError;
/**
 * Base error for conversation manager operations
 */
class ConversationManagerError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.name = 'ConversationManagerError';
        this.cause = cause;
    }
}
exports.ConversationManagerError = ConversationManagerError;
