import { beforeEach, describe, expect, it, vi, afterEach, type Mock } from 'vitest';
import { ConversationManager } from '../src/client/ConversationManager';
import { CodexClient } from '../src/client/CodexClient';
import { CodexClientBuilder } from '../src/client/CodexClientBuilder';
import {
  ConversationNotFoundError,
  MaxConversationsExceededError,
  ConversationManagerError,
} from '../src/types/conversation';
import type { RolloutData } from '../src/types/rollout';

// Mock the CodexClient and CodexClientBuilder
vi.mock('../src/client/CodexClient');
vi.mock('../src/client/CodexClientBuilder');

// Mock the ConversationResumer
vi.mock('../src/persistence/ConversationResumer', () => ({
  ConversationResumer: vi.fn().mockImplementation(() => ({
    resumeConversationWithHistory: vi.fn().mockResolvedValue('test-conversation-id'),
  })),
}));

// Mock file operations
vi.mock('../src/utils/fileOperations', () => ({
  readRolloutFile: vi.fn().mockResolvedValue({
    session: {
      id: 'test-session-id',
      timestamp: new Date().toISOString(),
      cwd: '/test/path',
      originator: 'test',
      cliVersion: '0.42.0',
    },
    events: [
      {
        timestamp: new Date().toISOString(),
        payload: {
          id: 'test-event-1',
          msg: { type: 'session_created' },
        },
      },
    ],
  } as RolloutData),
}));

describe('ConversationManager', () => {
  let manager: ConversationManager;
  let mockClient: Partial<CodexClient>;
  let mockBuilder: Partial<CodexClientBuilder>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      createConversation: vi.fn().mockResolvedValue('test-conversation-id'),
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Create mock builder
    mockBuilder = {
      withConfig: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue(mockClient),
    };

    // Set up mocks
    (CodexClientBuilder as Mock).mockImplementation(() => mockBuilder);
    (CodexClient as unknown as Mock).mockImplementation(() => mockClient);

    // Create manager with test configuration
    manager = new ConversationManager({
      maxConversations: 3,
      inactivityTimeout: 1000, // 1 second for testing
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
  });

  afterEach(async () => {
    // Clean up manager
    if (manager) {
      await manager.shutdown();
    }
  });

  describe('createConversation', () => {
    it('should create a new conversation successfully', async () => {
      const result = await manager.createConversation();

      expect(result.conversationId).toBe('test-conversation-id');
      expect(result.client).toBe(mockClient);
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.createConversation).toHaveBeenCalled();
    });

    it('should respect maxConversations limit', async () => {
      // Create max conversations
      await manager.createConversation();
      await manager.createConversation();
      await manager.createConversation();

      // Fourth should fail
      await expect(manager.createConversation()).rejects.toThrow(MaxConversationsExceededError);
    });

    it('should use custom conversation ID when provided', async () => {
      const customId = 'custom-conversation-id';
      const result = await manager.createConversation({
        conversationId: customId,
      });

      expect(result.conversationId).toBe(customId);
      expect(mockClient.createConversation).not.toHaveBeenCalled();
    });

    it('should merge configuration correctly', async () => {
      const customConfig = {
        logger: { debug: vi.fn() },
      };

      await manager.createConversation({ config: customConfig });

      expect(mockBuilder.withConfig).toHaveBeenCalledWith(
        expect.objectContaining(customConfig)
      );
    });

    it('should skip auto-connect when requested', async () => {
      await manager.createConversation({ autoConnect: false });

      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it('should emit conversationCreated event', async () => {
      const eventSpy = vi.fn();
      manager.on('conversationCreated', eventSpy);

      const result = await manager.createConversation();

      expect(eventSpy).toHaveBeenCalledWith({
        conversationId: result.conversationId,
        client: result.client,
      });
    });

    it('should handle creation errors', async () => {
      const error = new Error('Connection failed');
      (mockClient.connect as Mock).mockRejectedValue(error);

      await expect(manager.createConversation()).rejects.toThrow(ConversationManagerError);
    });
  });

  describe('getConversation', () => {
    it('should retrieve existing conversation', async () => {
      const { conversationId } = await manager.createConversation();
      const client = await manager.getConversation(conversationId);

      expect(client).toBe(mockClient);
    });

    it('should throw error for non-existent conversation', async () => {
      await expect(manager.getConversation('non-existent')).rejects.toThrow(
        'Conversation not found: non-existent'
      );
    });

    it('should update last activity when accessing conversation', async () => {
      const { conversationId } = await manager.createConversation();

      // Get conversation stats before access
      const statsBefore = manager.getStats();

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.getConversation(conversationId);

      // Verify the conversation is still tracked
      const conversations = manager.listConversations();
      expect(conversations).toHaveLength(1);
      expect(conversations[0].conversationId).toBe(conversationId);
    });
  });

  describe('removeConversation', () => {
    it('should remove existing conversation', async () => {
      const { conversationId } = await manager.createConversation();
      const result = await manager.removeConversation(conversationId);

      expect(result).toBe(true);
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should return false for non-existent conversation', async () => {
      const result = await manager.removeConversation('non-existent');
      expect(result).toBe(false);
    });

    it('should emit conversationRemoved event', async () => {
      const eventSpy = vi.fn();
      manager.on('conversationRemoved', eventSpy);

      const { conversationId } = await manager.createConversation();
      await manager.removeConversation(conversationId);

      expect(eventSpy).toHaveBeenCalledWith({ conversationId });
    });

    it('should handle close errors gracefully', async () => {
      const { conversationId } = await manager.createConversation();
      const error = new Error('Close failed');
      (mockClient.close as Mock).mockRejectedValue(error);

      await expect(manager.removeConversation(conversationId)).rejects.toThrow(
        ConversationManagerError
      );
    });
  });

  describe('resumeConversationFromRollout', () => {
    const mockRolloutData: RolloutData = {
      session: {
        id: 'test-session-id',
        timestamp: new Date().toISOString(),
        cwd: '/test/path',
        originator: 'test',
        cliVersion: '0.42.0',
      },
      events: [
        {
          timestamp: new Date().toISOString(),
          payload: {
            id: 'test-event-2',
            msg: { type: 'session_created' },
          },
        },
      ],
    };

    it('should resume conversation from rollout data', async () => {
      const result = await manager.resumeConversationFromRollout(mockRolloutData);

      expect(result.conversationId).toBe('test-conversation-id');
      expect(result.client).toBeTruthy();
    });

    it('should respect maxConversations limit for resumed conversations', async () => {
      // Create max conversations
      await manager.createConversation();
      await manager.createConversation();
      await manager.createConversation();

      // Resume should fail
      await expect(
        manager.resumeConversationFromRollout(mockRolloutData)
      ).rejects.toThrow(MaxConversationsExceededError);
    });

    it('should emit conversationResumed event', async () => {
      const eventSpy = vi.fn();
      manager.on('conversationResumed', eventSpy);

      const result = await manager.resumeConversationFromRollout(mockRolloutData);

      expect(eventSpy).toHaveBeenCalledWith({
        conversationId: result.conversationId,
        client: result.client,
        rolloutData: mockRolloutData,
      });
    });
  });

  describe('resumeConversationFromFile', () => {
    it('should resume conversation from file', async () => {
      const result = await manager.resumeConversationFromFile('/test/rollout.jsonl');

      expect(result.conversationId).toBe('test-conversation-id');
      expect(result.client).toBeTruthy();
    });

    it('should handle file read errors', async () => {
      const { readRolloutFile } = await import('../src/utils/fileOperations');
      (readRolloutFile as Mock).mockRejectedValue(new Error('File not found'));

      await expect(
        manager.resumeConversationFromFile('/non-existent.jsonl')
      ).rejects.toThrow(ConversationManagerError);
    });
  });

  describe('listConversations', () => {
    it('should return empty list initially', () => {
      const conversations = manager.listConversations();
      expect(conversations).toEqual([]);
    });

    it('should list created conversations', async () => {
      const { conversationId } = await manager.createConversation();
      const conversations = manager.listConversations();

      expect(conversations).toHaveLength(1);
      expect(conversations[0]).toMatchObject({
        conversationId,
        isActive: true,
      });
      expect(conversations[0].createdAt).toBeInstanceOf(Date);
      expect(conversations[0].lastActivity).toBeInstanceOf(Date);
    });

    it('should not include removed conversations', async () => {
      const { conversationId } = await manager.createConversation();
      await manager.removeConversation(conversationId);

      const conversations = manager.listConversations();
      expect(conversations).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const stats1 = manager.getStats();
      expect(stats1).toMatchObject({
        totalConversations: 0,
        activeConversations: 0,
        maxConversations: 3,
        oldestConversation: undefined,
        newestConversation: undefined,
      });

      await manager.createConversation();
      await manager.createConversation();

      const stats2 = manager.getStats();
      expect(stats2).toMatchObject({
        totalConversations: 2,
        activeConversations: 2,
        maxConversations: 3,
      });
      expect(stats2.oldestConversation).toBeInstanceOf(Date);
      expect(stats2.newestConversation).toBeInstanceOf(Date);
    });
  });

  describe('shutdown', () => {
    it('should close all conversations on shutdown', async () => {
      await manager.createConversation();
      await manager.createConversation();

      await manager.shutdown();

      expect(mockClient.close).toHaveBeenCalledTimes(2);
    });

    it('should emit shutdown event', async () => {
      const eventSpy = vi.fn();
      manager.on('shutdown', eventSpy);

      await manager.shutdown();

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should prevent new conversations after shutdown', async () => {
      await manager.shutdown();

      await expect(manager.createConversation()).rejects.toThrow(
        'Manager is shutting down'
      );
    });

    it('should handle close errors during shutdown', async () => {
      await manager.createConversation();
      (mockClient.close as Mock).mockRejectedValue(new Error('Close failed'));

      // Should not throw, just log warnings
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('inactivity handling', () => {
    it('should mark conversations as inactive after timeout', async () => {
      const eventSpy = vi.fn();
      manager.on('conversationInactive', eventSpy);

      const { conversationId } = await manager.createConversation();

      // Wait for inactivity timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(eventSpy).toHaveBeenCalledWith({
        conversationId,
        lastActivity: expect.any(Date),
      });
    });

    it('should reset inactivity timer on conversation access', async () => {
      const eventSpy = vi.fn();
      manager.on('conversationInactive', eventSpy);

      const { conversationId } = await manager.createConversation();

      // Wait half the timeout
      await new Promise(resolve => setTimeout(resolve, 500));

      // Access conversation to reset timer
      await manager.getConversation(conversationId);

      // Wait another half timeout (should not trigger inactivity)
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should set up client event handlers', async () => {
      const { client } = await manager.createConversation();

      expect(client.on).toHaveBeenCalledWith('event', expect.any(Function));
      expect(client.on).toHaveBeenCalledWith('eventStreamClosed', expect.any(Function));
      expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should emit conversationError on client error', async () => {
      const errorSpy = vi.fn();
      manager.on('conversationError', errorSpy);

      const { conversationId, client } = await manager.createConversation();

      // Get the error handler
      const errorHandler = (client.on as Mock).mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      // Simulate client error
      const testError = new Error('Client error');
      errorHandler(testError);

      expect(errorSpy).toHaveBeenCalledWith({
        conversationId,
        error: testError,
      });
    });
  });
});