import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SessionSerializer } from '../src/persistence/SessionSerializer';
import { DataStorage } from '../src/monitoring/DataStorage';
import { ConversationResumer } from '../src/persistence/ConversationResumer';
import { RolloutRecorder } from '../src/persistence/RolloutRecorder';
import { ConversationManager } from '../src/client/ConversationManager';
import { StatusStore } from '../src/internal/StatusStore';
import * as fileOps from '../src/utils/fileOperations';
import { CodexClient } from '../src/client/CodexClient';

// Mock modules
vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(),
  promises: {
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn()
  }
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn()
}));

describe.skip('Coverage Improvements - Partial', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('SessionSerializer - Missing Coverage', () => {
    let serializer: SessionSerializer;

    beforeEach(() => {
      serializer = new SessionSerializer();
    });

    it('should handle serializeMetadata and deserializeMetadata', () => {
      const metadata = {
        id: 'test-id',
        timestamp: '2024-01-01T00:00:00Z',
        cwd: '/test',
        originator: 'test',
        cliVersion: '1.0.0'
      };

      // Test regular serialization
      const json = serializer.serializeMetadata(metadata);
      expect(json).toBe(JSON.stringify(metadata));

      // Test pretty print
      const prettyJson = serializer.serializeMetadata(metadata, true);
      expect(prettyJson).toBe(JSON.stringify(metadata, null, 2));

      // Test deserialization
      const deserialized = serializer.deserializeMetadata(json);
      expect(deserialized).toEqual(metadata);
    });

    it('should throw error for invalid metadata in deserializeMetadata', () => {
      expect(() => serializer.deserializeMetadata('{"invalid": true}')).toThrow('Invalid session metadata');
    });

    it('should validate metadata correctly', () => {
      // Valid metadata
      const validMetadata = {
        id: 'test',
        timestamp: '2024-01-01',
        cwd: '/test',
        originator: 'test',
        cliVersion: '1.0.0'
      };
      expect(serializer.validateMetadata(validMetadata)).toBe(true);

      // Valid with instructions
      const withInstructions = { ...validMetadata, instructions: 'test instructions' };
      expect(serializer.validateMetadata(withInstructions)).toBe(true);

      // Invalid cases
      expect(serializer.validateMetadata(null)).toBe(false);
      expect(serializer.validateMetadata(undefined)).toBe(false);
      expect(serializer.validateMetadata('string')).toBe(false);
      expect(serializer.validateMetadata(123)).toBe(false);
      expect(serializer.validateMetadata({})).toBe(false);
      expect(serializer.validateMetadata({ id: 123 })).toBe(false);
      expect(serializer.validateMetadata({ ...validMetadata, instructions: 123 })).toBe(false);
    });

    it('should handle createTestMetadata', () => {
      const testMetadata = serializer.createTestMetadata();
      expect(testMetadata).toHaveProperty('id');
      expect(testMetadata).toHaveProperty('timestamp');
      expect(testMetadata).toHaveProperty('cwd');
      expect(testMetadata.originator).toBe('unknown');
      expect(testMetadata.cliVersion).toBe('unknown');

      // With overrides
      const withOverrides = serializer.createTestMetadata({
        id: 'custom-id',
        originator: 'custom'
      });
      expect(withOverrides.id).toBe('custom-id');
      expect(withOverrides.originator).toBe('custom');
    });

    it('should handle getEnvironmentInfo', () => {
      const envInfo = serializer.getEnvironmentInfo();
      expect(envInfo).toHaveProperty('nodeVersion');
      expect(envInfo).toHaveProperty('platform');
      expect(envInfo).toHaveProperty('arch');
      expect(envInfo).toHaveProperty('cwd');
      expect(envInfo).toHaveProperty('environment');
      expect(envInfo.environment).toHaveProperty('CODEX_HOME');
      expect(envInfo.environment).toHaveProperty('NODE_ENV');
    });

    it('should handle custom generator that throws', async () => {
      const customSerializer = new SessionSerializer({
        generateId: () => {
          throw new Error('Generator error');
        }
      });

      const metadata = await customSerializer.createSessionMetadata();
      expect(metadata.id).toBeDefined(); // Should fall back to default
    });

    it('should handle custom generator that returns empty string', async () => {
      const customSerializer = new SessionSerializer({
        generateId: () => ''
      });

      const metadata = await customSerializer.createSessionMetadata();
      expect(metadata.id).toBeDefined(); // Should fall back to default
    });

    it('should handle custom originator detector that throws', async () => {
      const customSerializer = new SessionSerializer({
        detectOriginator: () => {
          throw new Error('Detector error');
        }
      });

      const originator = customSerializer.detectOriginator();
      expect(originator).toBeDefined(); // Should fall back to default
    });

    it('should handle custom originator detector that returns empty string', () => {
      const customSerializer = new SessionSerializer({
        detectOriginator: () => ''
      });

      const originator = customSerializer.detectOriginator();
      expect(originator).toBe('unknown'); // Should fall back to default
    });

    it('should handle process.cwd() errors in safeGetCwd', async () => {
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockImplementation(() => {
        throw new Error('CWD error');
      });

      const metadata = await serializer.createSessionMetadata();
      expect(metadata.cwd).toBe('unknown');

      process.cwd = originalCwd;
    });

    it('should handle env restoration errors in safeEnvAccess', () => {
      // This tests the catch block in safeEnvAccess when restoration fails
      const originalEnv = process.env;
      Object.defineProperty(process, 'env', {
        get() {
          throw new Error('Env access error');
        },
        configurable: false // Make it non-configurable to trigger restoration error
      });

      try {
        serializer.detectOriginator();
      } catch {
        // Expected to fail
      }

      // Restore
      Object.defineProperty(process, 'env', {
        value: originalEnv,
        configurable: true
      });
    });
  });

  describe('DataStorage - Error Paths', () => {
    let storage: DataStorage;

    beforeEach(() => {
      storage = new DataStorage();
    });

    it('should handle errors in stopMonitoring when not monitoring', async () => {
      const result = await storage.stopMonitoring();
      expect(result).toBeNull();
    });

    it('should handle errors in exportData', async () => {
      const data = await storage.exportData();
      expect(data).toHaveProperty('rateLimits');
      expect(data).toHaveProperty('tokenUsage');
    });

    it('should emit dataPointCollected event with error', async () => {
      const mockClient = {
        on: vi.fn((event, handler) => {
          if (event === 'event') {
            // Trigger an event that will cause an error
            setTimeout(() => {
              handler({
                msg: { type: 'error_event' },
                timestamp: 'invalid-timestamp'
              });
            }, 0);
          }
        }),
        off: vi.fn()
      };

      const errorHandler = vi.fn();
      storage.on('error', errorHandler);

      storage.startMonitoring(mockClient as any);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should handle malformed events gracefully', () => {
      const mockClient = {
        on: vi.fn((event, handler) => {
          if (event === 'event') {
            // Send malformed event
            handler({ msg: null });
            handler({ msg: {} });
            handler({});
          }
        }),
        off: vi.fn()
      };

      expect(() => storage.startMonitoring(mockClient as any)).not.toThrow();
    });

    it('should handle export errors when write fails', async () => {
      const fsPromises = await import('fs/promises');
      (fsPromises.writeFile as Mock).mockRejectedValue(new Error('Write failed'));

      await expect(storage.exportForWebsite('/test/path.json')).rejects.toThrow('Failed to export');
    });
  });

  describe('ConversationManager - Shutdown/Error Scenarios', () => {
    it('should handle error during shutdown', async () => {
      const manager = new ConversationManager();

      // Create a conversation with a client that will fail to close
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockRejectedValue(new Error('Close failed')),
        createConversation: vi.fn().mockResolvedValue('conv-1')
      };

      // Inject a conversation directly (since we can't mock the builder easily)
      (manager as any).conversations.set('conv-1', {
        conversationId: 'conv-1',
        client: mockClient,
        createdAt: new Date(),
        lastActivity: new Date(),
        status: 'active'
      });

      // Shutdown should handle the error gracefully
      await expect(manager.shutdown()).resolves.not.toThrow();
    });

    it('should handle getConversation for non-existent ID', () => {
      const manager = new ConversationManager();
      const result = manager.getConversation('non-existent');
      expect(result).toBeUndefined();
    });

    it('should handle listConversations', async () => {
      const manager = new ConversationManager();
      const list = manager.listConversations();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    });

    it('should emit conversationInactive event', async () => {
      vi.useFakeTimers();
      const manager = new ConversationManager({ inactivityTimeout: 100 });

      const inactiveHandler = vi.fn();
      manager.on('conversationInactive', inactiveHandler);

      // Add a conversation
      (manager as any).conversations.set('test-conv', {
        conversationId: 'test-conv',
        client: {},
        createdAt: new Date(),
        lastActivity: new Date(),
        status: 'active'
      });

      // Set up timer
      (manager as any).resetInactivityTimer('test-conv');

      // Advance time
      vi.advanceTimersByTime(150);

      expect(inactiveHandler).toHaveBeenCalledWith('test-conv');

      vi.useRealTimers();
    });
  });

  describe('StatusStore - Edge Cases', () => {
    let store: StatusStore;

    beforeEach(() => {
      store = new StatusStore();
    });

    it('should handle update with malformed rate limit data', () => {
      const event = {
        msg: {
          type: 'token_count',
          model: 'test-model',
          usage: { input: 100, output: 50 }
          // Missing rate_limits
        }
      };

      expect(() => store.update(event as any)).not.toThrow();
    });

    it('should handle getModelInfo for unknown model', () => {
      const info = store.getModelInfo('unknown-model');
      expect(info).toBeUndefined();
    });

    it('should handle getRateLimitWindow with unknown window', () => {
      // Set up some rate limit data first
      store.processEvent({
        msg: {
          type: 'token_count',
          model: 'test-model',
          usage: { input: 100, output: 50 },
          rate_limits: {
            requests: { limit: 1000, remaining: 900, window: 'minute' },
            tokens: { limit: 10000, remaining: 9000, window: 'hour' }
          }
        }
      } as any);

      const window = store.getRateLimitWindow('unknown' as any);
      expect(window).toBeUndefined();
    });

    it('should handle edge cases in time window calculation', () => {
      store.processEvent({
        msg: {
          type: 'token_count',
          usage: { input: 100, output: 50 },
          rate_limits: {
            requests: { limit: 1000, remaining: 900, window: 'Week' }, // Capital W
            tokens: { limit: 10000, remaining: 9000, window: 'MONTH' } // All caps
          }
        }
      } as any);

      const weekWindow = store.getRateLimitWindow('week');
      const monthWindow = store.getRateLimitWindow('month');
      expect(weekWindow).toBeDefined();
      expect(monthWindow).toBeDefined();
    });
  });

  describe('RolloutRecorder - Edge Cases', () => {
    let recorder: RolloutRecorder;

    beforeEach(() => {
      recorder = new RolloutRecorder();
    });

    it('should handle startRecording with write errors', async () => {
      vi.mocked(fs.promises.writeFile).mockRejectedValue(new Error('Write failed'));

      await expect(recorder.startRecording('/test/output.json')).rejects.toThrow();
    });

    it('should handle recordEvent errors gracefully', async () => {
      await recorder.startRecording('/test/output.json');

      // Mock write to fail
      (recorder as any).writeToFile = vi.fn().mockRejectedValue(new Error('Write failed'));

      const errorHandler = vi.fn();
      recorder.on('error', errorHandler);

      await recorder.recordEvent({ type: 'test', data: 'test' });

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should handle stopRecording with finalization errors', async () => {
      await recorder.startRecording('/test/output.json');

      // Mock finalize to fail
      (recorder as any).finalizeOutput = vi.fn().mockRejectedValue(new Error('Finalize failed'));

      const result = await recorder.stopRecording();
      expect(result).toBeNull(); // Should handle error gracefully
    });

    it('should handle filter function that throws', async () => {
      const recorder = new RolloutRecorder({
        eventFilter: () => {
          throw new Error('Filter error');
        }
      });

      await recorder.startRecording('/test/output.json');

      // Should handle error and include event anyway
      await expect(recorder.recordEvent({ type: 'test' })).resolves.not.toThrow();
    });
  });

  describe('fileOperations - Error Handling', () => {
    it('should handle readRolloutFile with permission errors', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      await expect(fileOps.readRolloutFile('/test/file.json')).rejects.toThrow();
    });

    it('should handle writeRolloutFile with disk full error', async () => {
      vi.mocked(fs.promises.writeFile).mockRejectedValue(new Error('ENOSPC: no space left'));

      await expect(fileOps.writeRolloutFile('/test/file.json', {} as any)).rejects.toThrow();
    });

    it('should handle validateRolloutFile with corrupted data', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('corrupted{data');

      const result = await fileOps.validateRolloutFile('/test/file.json');
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle extractSessionMetadata with JSONL missing session', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"type": "event"}\n{"type": "event"}');

      const metadata = await fileOps.extractSessionMetadata('/test/file.jsonl');
      expect(metadata).toBeNull();
    });

    it('should handle ensureDirectoryExists with nested permission errors', async () => {
      vi.mocked(fs.promises.mkdir).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(fileOps.ensureDirectoryExists('/root/protected/dir')).rejects.toThrow();
    });

    it('should handle createTemplatedPath with null values', () => {
      const result = fileOps.createTemplatedPath('/path/{var}/file', { var: null as any });
      expect(result).toBe('/path//file');
    });

    it('should handle createTemplatedPath with undefined values', () => {
      const result = fileOps.createTemplatedPath('/path/{var}/file', { var: undefined as any });
      expect(result).toBe('/path//file');
    });
  });

  describe('ConversationResumer - Error Scenarios', () => {
    it('should handle replay errors for specific event types', async () => {
      const mockClient = {
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        createConversation: vi.fn().mockResolvedValue('test-conv'),
        sendMessage: vi.fn().mockRejectedValue(new Error('Send failed'))
      };

      const resumer = new ConversationResumer(mockClient as any);

      const rolloutData = {
        session: {
          id: 'test',
          timestamp: new Date().toISOString(),
          cwd: '/',
          originator: 'test',
          cliVersion: '1.0.0'
        },
        events: [
          { type: 'session_created', timestamp: new Date().toISOString() },
          { type: 'user_message', timestamp: new Date().toISOString(), payload: { message: 'test' } }
        ]
      };

      await expect(resumer.resumeConversation(rolloutData)).rejects.toThrow();
    });

    it('should handle validation with missing required fields', async () => {
      const resumer = new ConversationResumer({} as any);

      const invalidData = {
        session: {} as any,
        events: []
      };

      const result = await resumer.validateRolloutData(invalidData);
      expect(result.isValid).toBe(false);
    });

    it('should handle concurrent resumption attempts', async () => {
      const mockClient = {
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        createConversation: vi.fn().mockResolvedValue('test-conv')
      };

      const resumer = new ConversationResumer(mockClient as any);
      const rolloutData = {
        session: {
          id: 'test',
          timestamp: new Date().toISOString(),
          cwd: '/',
          originator: 'test',
          cliVersion: '1.0.0'
        },
        events: [
          { type: 'session_created', timestamp: new Date().toISOString() }
        ]
      };

      // Start first resumption
      const promise1 = resumer.resumeConversation(rolloutData);

      // Try to start second resumption
      await expect(resumer.resumeConversation(rolloutData)).rejects.toThrow('already in progress');

      await promise1;
    });
  });
});