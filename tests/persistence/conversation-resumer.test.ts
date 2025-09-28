import { beforeEach, describe, expect, it, vi, afterEach, type Mock } from 'vitest';
import { ConversationResumer } from '../../src/persistence/ConversationResumer';
import { CodexClient } from '../../src/client/CodexClient';
import { CodexClientBuilder } from '../../src/client/CodexClientBuilder';
import type { RolloutData, SessionMetadata } from '../../src/types/rollout';
import type { CodexEvent } from '../../src/types/events';
import type { ResumptionOptions, ValidationRule } from '../../src/types/resumption';
import {
  ValidationError as ValidationErrorClass,
  ResumptionTimeoutError,
  ResumptionError,
} from '../../src/types/resumption';

// Mock dependencies
vi.mock('../../src/client/CodexClient');
vi.mock('../../src/client/CodexClientBuilder');

describe('ConversationResumer', () => {
  let resumer: ConversationResumer;
  let mockClient: Partial<CodexClient>;
  let mockBuilder: Partial<CodexClientBuilder>;
  let mockRolloutData: RolloutData;

  beforeEach(() => {
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

    // Create test rollout data
    mockRolloutData = {
      session: {
        id: 'test-session-id',
        timestamp: '2024-01-01T00:00:00.000Z',
        cwd: '/test/path',
        originator: 'test',
        cliVersion: '0.42.0',
      } as SessionMetadata,
      events: [
        {
          timestamp: '2024-01-01T00:00:01.000Z',
          payload: {
            msg: { type: 'session_created' },
            timestamp: '2024-01-01T00:00:01.000Z',
          } as CodexEvent,
        },
        {
          timestamp: '2024-01-01T00:00:02.000Z',
          payload: {
            msg: { type: 'turn_started' },
            timestamp: '2024-01-01T00:00:02.000Z',
          } as CodexEvent,
        },
        {
          timestamp: '2024-01-01T00:00:03.000Z',
          payload: {
            msg: { type: 'turn_completed' },
            timestamp: '2024-01-01T00:00:03.000Z',
          } as CodexEvent,
        },
      ],
    };

    resumer = new ConversationResumer();
  });

  afterEach(() => {
    if (resumer) {
      resumer.removeAllListeners();
    }
  });

  describe('resumeConversation', () => {
    it('should resume conversation successfully with default options', async () => {
      const result = await resumer.resumeConversation(mockRolloutData, {});

      expect(result).toMatchObject({
        conversationId: 'test-conversation-id',
        eventsReplayed: expect.any(Number),
        totalEvents: 3,
        resumedAt: expect.any(Date),
        validationResult: expect.objectContaining({
          isValid: true,
          eventCount: 3,
          sessionId: 'test-session-id',
        }),
        skippedEvents: expect.any(Number),
        errors: expect.any(Array),
      });

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.createConversation).toHaveBeenCalled();
    });

    it('should skip validation when validateData is false', async () => {
      const options: ResumptionOptions = {
        validateData: false,
      };

      const result = await resumer.resumeConversation(mockRolloutData, {}, options);

      expect(result.validationResult.isValid).toBe(true);
      expect(result.validationResult.errors).toHaveLength(0);
    });

    it('should skip side-effect events by default', async () => {
      const rolloutWithSideEffects: RolloutData = {
        ...mockRolloutData,
        events: [
          ...mockRolloutData.events,
          {
            timestamp: '2024-01-01T00:00:04.000Z',
            payload: {
              msg: { type: 'file_write' }, // Side effect event
              timestamp: '2024-01-01T00:00:04.000Z',
            } as CodexEvent,
          },
        ],
      };

      const result = await resumer.resumeConversation(rolloutWithSideEffects, {});

      expect(result.skippedEvents).toBeGreaterThan(0);
    });

    it('should apply event filter when provided', async () => {
      const options: ResumptionOptions = {
        eventFilter: (event) => event.msg.type !== 'turn_started',
      };

      const result = await resumer.resumeConversation(mockRolloutData, {}, options);

      expect(result.eventsReplayed).toBeLessThan(result.totalEvents);
    });

    it('should handle resumption timeout', async () => {
      const options: ResumptionOptions = {
        timeoutMs: 100, // Very short timeout
      };

      // Mock a slow event replay
      vi.spyOn(resumer as any, 'replayEvent').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      await expect(
        resumer.resumeConversation(mockRolloutData, {}, options)
      ).rejects.toThrow(ResumptionTimeoutError);
    });

    it('should continue on error when continueOnError is true', async () => {
      const options: ResumptionOptions = {
        continueOnError: true,
      };

      // Mock event replay to fail on second event
      vi.spyOn(resumer as any, 'replayEvent')
        .mockResolvedValueOnce(undefined) // First event succeeds
        .mockRejectedValueOnce(new Error('Replay failed')) // Second event fails
        .mockResolvedValueOnce(undefined); // Third event succeeds

      const result = await resumer.resumeConversation(mockRolloutData, {}, options);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(ResumptionError);
    });

    it('should stop on error when continueOnError is false', async () => {
      const options: ResumptionOptions = {
        continueOnError: false,
      };

      // Mock event replay to fail on second event
      vi.spyOn(resumer as any, 'replayEvent')
        .mockResolvedValueOnce(undefined) // First event succeeds
        .mockRejectedValueOnce(new Error('Replay failed')); // Second event fails

      await expect(
        resumer.resumeConversation(mockRolloutData, {}, options)
      ).rejects.toThrow(ResumptionError);
    });

    it('should emit resumptionCompleted event', async () => {
      const eventSpy = vi.fn();
      resumer.on('resumptionCompleted', eventSpy);

      const result = await resumer.resumeConversation(mockRolloutData, {});

      expect(eventSpy).toHaveBeenCalledWith(result);
    });

    it('should emit eventReplayed events during replay', async () => {
      const eventSpy = vi.fn();
      resumer.on('eventReplayed', eventSpy);

      await resumer.resumeConversation(mockRolloutData, {});

      expect(eventSpy).toHaveBeenCalled();
      expect(eventSpy.mock.calls[0][0]).toMatchObject({
        event: expect.any(Object),
        index: expect.any(Number),
        totalEvents: expect.any(Number),
      });
    });

    it('should emit eventReplayFailed events on replay errors', async () => {
      const eventSpy = vi.fn();
      resumer.on('eventReplayFailed', eventSpy);

      // Mock event replay to fail
      vi.spyOn(resumer as any, 'replayEvent').mockRejectedValue(new Error('Replay failed'));

      const options: ResumptionOptions = {
        continueOnError: true,
      };

      await resumer.resumeConversation(mockRolloutData, {}, options);

      expect(eventSpy).toHaveBeenCalled();
      expect(eventSpy.mock.calls[0][0]).toMatchObject({
        event: expect.any(Object),
        index: expect.any(Number),
        error: expect.any(ResumptionError),
      });
    });

    it('should handle client connection errors', async () => {
      (mockClient.connect as Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(
        resumer.resumeConversation(mockRolloutData, {})
      ).rejects.toThrow('Connection failed');
    });

    it('should handle conversation creation errors', async () => {
      (mockClient.createConversation as Mock).mockRejectedValue(new Error('Creation failed'));

      await expect(
        resumer.resumeConversation(mockRolloutData, {})
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('resumeConversationWithHistory', () => {
    it('should return conversation ID from successful resumption', async () => {
      const conversationId = await resumer.resumeConversationWithHistory(mockRolloutData, {});

      expect(conversationId).toBe('test-conversation-id');
    });

    it('should propagate resumption errors', async () => {
      (mockClient.connect as Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(
        resumer.resumeConversationWithHistory(mockRolloutData, {})
      ).rejects.toThrow('Connection failed');
    });
  });

  describe('validateRolloutData', () => {
    it('should validate correct rollout data successfully', async () => {
      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(mockRolloutData, options);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.eventCount).toBe(3);
      expect(result.sessionId).toBe('test-session-id');
    });

    it('should detect missing session metadata', async () => {
      const invalidData = {
        ...mockRolloutData,
        session: undefined as any,
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(invalidData, options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_SESSION',
          severity: 'error',
        })
      );
    });

    it('should detect missing session ID', async () => {
      const invalidData = {
        ...mockRolloutData,
        session: {
          ...mockRolloutData.session,
          id: undefined as any,
        },
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(invalidData, options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_SESSION_ID',
          severity: 'error',
        })
      );
    });

    it('should detect invalid events array', async () => {
      const invalidData = {
        ...mockRolloutData,
        events: 'not an array' as any,
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(invalidData, options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_EVENTS',
          severity: 'error',
        })
      );
    });

    it('should detect missing event timestamps', async () => {
      const invalidData = {
        ...mockRolloutData,
        events: [
          {
            timestamp: undefined as any,
            payload: mockRolloutData.events[0].payload,
          },
        ],
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(invalidData, options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_EVENT_TIMESTAMP',
          eventIndex: 0,
        })
      );
    });

    it('should detect missing session_created event', async () => {
      const dataWithoutSessionCreated = {
        ...mockRolloutData,
        events: mockRolloutData.events.filter(e => e.payload.msg.type !== 'session_created'),
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(dataWithoutSessionCreated, options);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_SESSION_CREATED',
          impact: 'medium',
        })
      );
    });

    it('should run custom validation rules', async () => {
      const customRule: ValidationRule = {
        name: 'test-rule',
        validate: vi.fn().mockReturnValue([
          {
            code: 'CUSTOM_ERROR',
            message: 'Custom validation failed',
            severity: 'error' as const,
          },
        ]),
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [customRule],
        logger: {},
      };

      const result = await resumer.validateRolloutData(mockRolloutData, options);

      expect(customRule.validate).toHaveBeenCalledWith(mockRolloutData);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CUSTOM_ERROR',
          severity: 'error',
        })
      );
    });

    it('should handle custom validation rule errors', async () => {
      const faultyRule: ValidationRule = {
        name: 'faulty-rule',
        validate: vi.fn().mockImplementation(() => {
          throw new Error('Validation rule crashed');
        }),
      };

      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [faultyRule],
        logger: {},
      };

      const result = await resumer.validateRolloutData(mockRolloutData, options);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'VALIDATION_RULE_ERROR',
          impact: 'medium',
        })
      );
    });

    it('should estimate replay time based on event count', async () => {
      const options: Required<ResumptionOptions> = {
        validateData: true,
        skipSideEffects: true,
        timeoutMs: 30000,
        continueOnError: true,
        eventFilter: () => true,
        customValidation: [],
        logger: {},
      };

      const result = await resumer.validateRolloutData(mockRolloutData, options);

      expect(result.estimatedReplayTime).toBeGreaterThan(0);
      expect(typeof result.estimatedReplayTime).toBe('number');
    });
  });

  describe('getCurrentState', () => {
    it('should return null when not actively resuming', () => {
      const state = resumer.getCurrentState();
      expect(state).toBeNull();
    });

    it('should return current state during resumption', async () => {
      // Mock a slow replay to capture state
      vi.spyOn(resumer as any, 'replayEvent').mockImplementation(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      );

      const resumptionPromise = resumer.resumeConversation(mockRolloutData, {});

      // Give resumption time to start
      await new Promise(resolve => setTimeout(resolve, 50));

      const state = resumer.getCurrentState();
      expect(state).toMatchObject({
        conversationId: 'test-conversation-id',
        currentEventIndex: expect.any(Number),
        totalEvents: 3,
        startedAt: expect.any(Date),
        lastActivity: expect.any(Date),
        status: expect.stringMatching(/replaying|completed/),
        errors: expect.any(Array),
      });

      await resumptionPromise;
    });

    it('should return copy of state (not reference)', async () => {
      // Start a resumption to get state
      const resumptionPromise = resumer.resumeConversation(mockRolloutData, {});

      await new Promise(resolve => setTimeout(resolve, 10));

      const state1 = resumer.getCurrentState();
      const state2 = resumer.getCurrentState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different references

      await resumptionPromise;
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError when validation fails', async () => {
      const invalidData = {
        ...mockRolloutData,
        session: undefined as any,
      };

      await expect(
        resumer.resumeConversation(invalidData, {})
      ).rejects.toThrow(ValidationErrorClass);
    });

    it('should update state to failed on errors', async () => {
      (mockClient.connect as Mock).mockRejectedValue(new Error('Connection failed'));

      try {
        await resumer.resumeConversation(mockRolloutData, {});
      } catch (error) {
        // Expected to fail
      }

      // State should be cleaned up after failure
      const state = resumer.getCurrentState();
      expect(state).toBeNull();
    });

    it('should clean up state after successful completion', async () => {
      await resumer.resumeConversation(mockRolloutData, {});

      const state = resumer.getCurrentState();
      expect(state).toBeNull();
    });
  });

  describe('logging', () => {
    it('should log resumption progress when logger is provided', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const options: ResumptionOptions = {
        logger: mockLogger,
      };

      await resumer.resumeConversation(mockRolloutData, {}, options);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting conversation resumption',
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation resumption completed',
        expect.any(Object)
      );
    });

    it('should handle missing logger gracefully', async () => {
      const options: ResumptionOptions = {
        logger: undefined,
      };

      await expect(
        resumer.resumeConversation(mockRolloutData, {}, options)
      ).resolves.toBeDefined();
    });
  });
});