import { beforeEach, describe, expect, it, vi, afterEach, type Mock } from 'vitest';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { RolloutRecorder } from '../../src/persistence/RolloutRecorder';
import { CodexClient } from '../../src/client/CodexClient';
import type { CodexEvent } from '../../src/types/events';
import type { SessionMetadata } from '../../src/types/rollout';

// Mock filesystem operations
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

// Mock path operations
vi.mock('path', () => ({
  resolve: vi.fn((path: string) => path),
  dirname: vi.fn().mockReturnValue('/test'),
}));

// Mock SessionSerializer
vi.mock('../../src/persistence/SessionSerializer', () => ({
  SessionSerializer: vi.fn().mockImplementation(() => ({
    createSessionMetadata: vi.fn().mockResolvedValue({
      id: 'test-session-id',
      timestamp: '2024-01-01T00:00:00.000Z',
      cwd: '/test/path',
      originator: 'test',
      cliVersion: '0.42.0',
    } as SessionMetadata),
  })),
}));

// Mock file operations
vi.mock('../../src/utils/fileOperations', () => ({
  writeRolloutFile: vi.fn().mockResolvedValue(undefined),
  createTemplatedPath: vi.fn().mockImplementation((template: string) => template.replace('{sessionId}', 'test-session').replace('{timestamp}', '2024-01-01')),
  ensureDirectoryExists: vi.fn(),
}));

describe('RolloutRecorder', () => {
  let recorder: RolloutRecorder;
  let mockClient: Partial<CodexClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      on: vi.fn(),
      off: vi.fn(),
    };

    recorder = new RolloutRecorder({
      outputPath: './test-{sessionId}.jsonl',
      format: 'jsonl',
      includeMetadata: true,
      prettyPrint: false,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
  });

  afterEach(async () => {
    if (recorder.getStats().isRecording) {
      await recorder.stopRecording();
    }
  });

  describe('startRecording', () => {
    it('should start recording successfully', async () => {
      await recorder.startRecording(mockClient as CodexClient);

      const stats = recorder.getStats();
      expect(stats.isRecording).toBe(true);
      expect(stats.sessionId).toBe('test-session-id');
      expect(mockClient.on).toHaveBeenCalledWith('event', expect.any(Function));
    });

    it('should write session header for JSONL format', async () => {
      await recorder.startRecording(mockClient as CodexClient);

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('test-session-id'),
        'utf-8'
      );
    });

    it('should emit recordingStarted event', async () => {
      const eventSpy = vi.fn();
      recorder.on('recordingStarted', eventSpy);

      await recorder.startRecording(mockClient as CodexClient);

      expect(eventSpy).toHaveBeenCalledWith({
        outputPath: expect.any(String),
        sessionMetadata: expect.objectContaining({
          id: 'test-session-id',
        }),
      });
    });

    it('should throw error if already recording', async () => {
      await recorder.startRecording(mockClient as CodexClient);

      await expect(
        recorder.startRecording(mockClient as CodexClient)
      ).rejects.toThrow('Recording is already in progress');
    });

    it('should merge custom session metadata', async () => {
      const customMetadata = {
        instructions: 'Custom instructions',
      };

      await recorder.startRecording(mockClient as CodexClient, customMetadata);

      const sessionMetadata = recorder.getSessionMetadata();
      expect(sessionMetadata).toMatchObject(customMetadata);
    });
  });

  describe('event recording', () => {
    let eventHandler: (event: CodexEvent) => void;

    beforeEach(async () => {
      await recorder.startRecording(mockClient as CodexClient);

      // Get the event handler that was registered
      const onCalls = (mockClient.on as Mock).mock.calls;
      const eventCall = onCalls.find(call => call[0] === 'event');
      eventHandler = eventCall?.[1];
    });

    it('should record events in JSONL format', () => {
      const testEvent: CodexEvent = {
        msg: { type: 'session_created' },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      eventHandler(testEvent);

      expect(appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('session_created'),
        'utf-8'
      );
    });

    it('should include metadata when configured', () => {
      const testEvent: CodexEvent = {
        msg: { type: 'turn_started' },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      eventHandler(testEvent);

      const events = recorder.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        timestamp: expect.any(String),
        payload: testEvent,
        metadata: {
          eventIndex: 0,
          sessionId: 'test-session-id',
        },
      });
    });

    it('should filter events when filter is provided', async () => {
      // Stop current recorder and create new one with filter
      await recorder.stopRecording();

      recorder = new RolloutRecorder({
        eventFilter: (event) => event.msg.type !== 'session_created',
      });

      await recorder.startRecording(mockClient as CodexClient);

      // Get new event handler - get the last one since we just registered it
      const onCalls = (mockClient.on as Mock).mock.calls;
      const eventCalls = onCalls.filter(call => call[0] === 'event');
      eventHandler = eventCalls[eventCalls.length - 1]?.[1];

      const sessionEvent: CodexEvent = {
        msg: { type: 'session_created' },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const turnEvent: CodexEvent = {
        msg: { type: 'turn_started' },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      eventHandler(sessionEvent);
      eventHandler(turnEvent);

      const events = recorder.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].payload.msg.type).toBe('turn_started');
    });

    it('should emit eventRecorded event', () => {
      const eventSpy = vi.fn();
      recorder.on('eventRecorded', eventSpy);

      const testEvent: CodexEvent = {
        msg: { type: 'token_count', info: { total: 100 } },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      eventHandler(testEvent);

      expect(eventSpy).toHaveBeenCalledWith({
        event: expect.objectContaining({
          payload: testEvent,
        }),
        index: 0,
      });
    });

    it('should handle recording errors gracefully', () => {
      const errorSpy = vi.fn();
      recorder.on('recordingError', errorSpy);

      // Mock appendFileSync to throw error
      (appendFileSync as Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const testEvent: CodexEvent = {
        msg: { type: 'turn_started' },
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      eventHandler(testEvent);

      expect(errorSpy).toHaveBeenCalledWith({
        error: expect.any(Error),
      });
    });
  });

  describe('stopRecording', () => {
    beforeEach(async () => {
      await recorder.startRecording(mockClient as CodexClient);
    });

    it('should stop recording and return output path', async () => {
      const outputPath = await recorder.stopRecording();

      expect(outputPath).toBeTruthy();
      expect(recorder.getStats().isRecording).toBe(false);
      expect(mockClient.off).toHaveBeenCalledWith('event', expect.any(Function));
    });

    it('should write complete JSON for JSON format', async () => {
      // Stop current recorder and create JSON format recorder
      await recorder.stopRecording();

      recorder = new RolloutRecorder({
        format: 'json',
      });

      await recorder.startRecording(mockClient as CodexClient);
      const outputPath = await recorder.stopRecording();

      const { writeRolloutFile } = await import('../../src/utils/fileOperations');
      expect(writeRolloutFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          session: expect.any(Object),
          events: expect.any(Array),
        }),
        'json',
        false
      );
    });

    it('should emit recordingCompleted event', async () => {
      const eventSpy = vi.fn();
      recorder.on('recordingCompleted', eventSpy);

      await recorder.stopRecording();

      expect(eventSpy).toHaveBeenCalledWith({
        outputPath: expect.any(String),
        eventCount: expect.any(Number),
        sessionMetadata: expect.objectContaining({
          id: 'test-session-id',
        }),
      });
    });

    it('should return null if not recording', async () => {
      await recorder.stopRecording();
      const result = await recorder.stopRecording();

      expect(result).toBeNull();
    });

    it('should handle finalization errors', async () => {
      const { writeRolloutFile } = await import('../../src/utils/fileOperations');
      (writeRolloutFile as Mock).mockRejectedValue(new Error('Write failed'));

      recorder = new RolloutRecorder({ format: 'json' });
      await recorder.startRecording(mockClient as CodexClient);

      await expect(recorder.stopRecording()).rejects.toThrow('Failed to stop recording');
    });
  });

  describe('getStats', () => {
    it('should return correct stats when not recording', () => {
      const stats = recorder.getStats();

      expect(stats).toMatchObject({
        isRecording: false,
        eventCount: 0,
        outputPath: null,
        sessionId: null,
        startedAt: null,
      });
    });

    it('should return correct stats when recording', async () => {
      await recorder.startRecording(mockClient as CodexClient);

      const stats = recorder.getStats();

      expect(stats).toMatchObject({
        isRecording: true,
        eventCount: 0,
        outputPath: expect.any(String),
        sessionId: 'test-session-id',
        startedAt: expect.any(Date),
      });
    });
  });

  describe('getEvents', () => {
    it('should return copy of events array', async () => {
      await recorder.startRecording(mockClient as CodexClient);

      const events1 = recorder.getEvents();
      const events2 = recorder.getEvents();

      expect(events1).toEqual(events2);
      expect(events1).not.toBe(events2); // Different references
    });
  });

  describe('getSessionMetadata', () => {
    it('should return null when not recording', () => {
      const metadata = recorder.getSessionMetadata();
      expect(metadata).toBeNull();
    });

    it('should return copy of session metadata when recording', async () => {
      await recorder.startRecording(mockClient as CodexClient);

      const metadata = recorder.getSessionMetadata();

      expect(metadata).toMatchObject({
        id: 'test-session-id',
        timestamp: expect.any(String),
        cwd: expect.any(String),
        originator: expect.any(String),
        cliVersion: expect.any(String),
      });
    });
  });

  describe('path templating', () => {
    it('should resolve template variables in output path', async () => {
      const recorder = new RolloutRecorder({
        outputPath: './sessions/{sessionId}-{timestamp}.jsonl',
      });

      await recorder.startRecording(mockClient as CodexClient);

      const stats = recorder.getStats();
      expect(stats.outputPath).toContain('test-session');
      expect(stats.outputPath).toContain('2024-01-01');
    });
  });

  describe('configuration validation', () => {
    it('should use default configuration when not provided', () => {
      const defaultRecorder = new RolloutRecorder();
      const stats = defaultRecorder.getStats();

      expect(stats.isRecording).toBe(false);
    });

    it('should respect format configuration', async () => {
      const jsonRecorder = new RolloutRecorder({ format: 'json' });
      await jsonRecorder.startRecording(mockClient as CodexClient);

      // For JSON format, session header should not be written immediately
      expect(writeFileSync).not.toHaveBeenCalled();

      await jsonRecorder.stopRecording();
    });

    it('should respect pretty print configuration', async () => {
      const prettyRecorder = new RolloutRecorder({
        format: 'jsonl',
        prettyPrint: true,
      });

      await prettyRecorder.startRecording(mockClient as CodexClient);

      // Check that writeFileSync was called with pretty-printed JSON
      const writeCall = (writeFileSync as Mock).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('\n'); // Pretty-printed JSON has newlines
    });
  });
});