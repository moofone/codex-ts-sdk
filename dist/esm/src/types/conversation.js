/**
 * Error thrown when conversation is not found
 */
export class ConversationNotFoundError extends Error {
    conversationId;
    constructor(conversationId) {
        super(`Conversation not found: ${conversationId}`);
        this.name = 'ConversationNotFoundError';
        this.conversationId = conversationId;
    }
}
/**
 * Error thrown when maximum conversations limit is exceeded
 */
export class MaxConversationsExceededError extends Error {
    maxConversations;
    currentCount;
    constructor(maxConversations, currentCount) {
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
    cause;
    constructor(message, cause) {
        super(message);
        this.name = 'ConversationManagerError';
        this.cause = cause;
    }
}
//# sourceMappingURL=conversation.js.map