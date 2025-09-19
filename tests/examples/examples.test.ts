/// <reference types="vitest" />
import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';

type ExampleEvent = {
  id: string;
  msg: {
    type: string;
    [key: string]: unknown;
  };
};

type SubmissionRecord = {
  op: {
    type: string;
    summary?: string;
    items?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

interface MockState {
  constructedConfigs: Array<Record<string, unknown>>;
  createConversation: ReturnType<typeof vi.fn>;
  sendUserTurn: ReturnType<typeof vi.fn>;
  respondToExecApproval: ReturnType<typeof vi.fn>;
  respondToPatchApproval: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  eventsImplementation: (client: unknown) => AsyncIterable<ExampleEvent>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  submissions: SubmissionRecord[];
  lastClientInstance?: unknown;
}

const mockState: MockState = {
  constructedConfigs: [],
  createConversation: vi.fn(),
  sendUserTurn: vi.fn(),
  respondToExecApproval: vi.fn(),
  respondToPatchApproval: vi.fn(),
  close: vi.fn(),
  eventsImplementation: () => createEventStream([]),
  on: vi.fn(),
  once: vi.fn(),
  submissions: [],
  lastClientInstance: undefined,
};

let exitSpy: MockInstance<typeof process.exit> | undefined;

function createEvent(type: string, extra: Record<string, unknown> = {}): ExampleEvent {
  return {
    id: `evt-${Math.random().toString(16).slice(2)}`,
    msg: {
      type,
      ...extra,
    },
  };
}

function createEventStream(events: ExampleEvent[]): AsyncIterable<ExampleEvent> {
  return (async function* iterate() {
    for (const event of events) {
      await Promise.resolve();
      yield event;
    }
  })();
}

function resetMockState(): void {
  mockState.constructedConfigs = [];
  mockState.submissions = [];
  mockState.lastClientInstance = undefined;
  mockState.createConversation.mockReset();
  mockState.createConversation.mockResolvedValue(undefined);
  mockState.sendUserTurn.mockReset();
  mockState.sendUserTurn.mockResolvedValue(undefined);
  mockState.respondToExecApproval.mockReset();
  mockState.respondToExecApproval.mockResolvedValue(undefined);
  mockState.respondToPatchApproval.mockReset();
  mockState.respondToPatchApproval.mockResolvedValue(undefined);
  mockState.close.mockReset();
  mockState.close.mockResolvedValue(undefined);
  mockState.on.mockReset();
  mockState.once.mockReset();
  mockState.eventsImplementation = () => createEventStream([]);
}

function registerSdkMock(): void {
  vi.doMock('codex-ts-sdk', () => {
    class MockCodexClient extends EventEmitter {
      private readonly plugins: Array<Record<string, unknown>>;
      private readonly logger: Record<string, unknown>;

      constructor(private readonly config: Record<string, unknown> = {}) {
        super();
        mockState.constructedConfigs.push(config);
        mockState.lastClientInstance = this;
        this.logger = (config.logger as Record<string, unknown>) ?? {};
        this.plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
        for (const plugin of this.plugins) {
          const initialize = typeof plugin?.initialize === 'function' ? plugin.initialize : undefined;
          if (initialize) {
            void Promise.resolve(initialize({ client: this, logger: this.logger })).catch(() => undefined);
          }
        }
      }

      async createConversation(options?: unknown): Promise<void> {
        await mockState.createConversation(options);
      }

      async sendUserTurn(text: string, options?: Record<string, unknown>): Promise<void> {
        const baseSubmission: SubmissionRecord = {
          op: {
            type: 'user_turn',
            summary: typeof options?.summary === 'string' ? options.summary : 'auto',
            items: Array.isArray(options?.items)
              ? options.items
              : [
                  {
                    type: 'text',
                    text,
                  },
                ],
          },
        };

        let submission = baseSubmission;
        for (const plugin of this.plugins) {
          const beforeSubmit = typeof plugin?.beforeSubmit === 'function' ? plugin.beforeSubmit : undefined;
          if (beforeSubmit) {
            submission = (await beforeSubmit(submission)) ?? submission;
          }
        }

        mockState.submissions.push(submission);
        await mockState.sendUserTurn(text, options, submission);
      }

      events(): AsyncIterable<ExampleEvent> {
        const iterable = mockState.eventsImplementation(this);
        const plugins = this.plugins;

        return (async function* stream() {
          try {
            for await (const event of iterable) {
              for (const plugin of plugins) {
                const afterEvent = typeof plugin?.afterEvent === 'function' ? plugin.afterEvent : undefined;
                if (afterEvent) {
                  await afterEvent(event);
                }
              }
              yield event;
            }
          } catch (error) {
            for (const plugin of plugins) {
              const onError = typeof plugin?.onError === 'function' ? plugin.onError : undefined;
              if (onError) {
                await onError(error);
              }
            }
            throw error;
          }
        })();
      }

      async respondToExecApproval(id: string, decision: string): Promise<void> {
        await mockState.respondToExecApproval(id, decision);
      }

      async respondToPatchApproval(id: string, decision: string): Promise<void> {
        await mockState.respondToPatchApproval(id, decision);
      }

      async close(): Promise<void> {
        await mockState.close();
      }

      override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
        mockState.on(event, listener);
        return super.on(event, listener);
      }

      override once(event: string | symbol, listener: (...args: unknown[]) => void): this {
        mockState.once(event, listener);
        return super.once(event, listener);
      }
    }

    class MockCodexClientBuilder {
      private readonly config: Record<string, unknown> = {};

      withCodexHome(home: string | undefined): this {
        if (home !== undefined) {
          this.config.codexHome = home;
        }
        return this;
      }

      withRetryPolicy(policy: unknown): this {
        this.config.retryPolicy = policy;
        return this;
      }

      withSandboxPolicy(policy: unknown): this {
        this.config.sandboxPolicy = policy;
        return this;
      }

      withDefaultModel(model: string): this {
        this.config.defaultModel = model;
        return this;
      }

      withDefaultEffort(effort: string): this {
        this.config.defaultEffort = effort;
        return this;
      }

      withDefaultSummary(summary: string): this {
        this.config.defaultSummary = summary;
        return this;
      }

      withLogger(logger: unknown): this {
        this.config.logger = logger;
        return this;
      }

      build(): MockCodexClient {
        return new MockCodexClient({ ...this.config });
      }
    }

    class MockCodexError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = 'CodexError';
      }
    }

    class MockCodexAuthError extends MockCodexError {}
    class MockCodexConnectionError extends MockCodexError {}
    class MockCodexSessionError extends MockCodexError {}

    return {
      CodexClient: MockCodexClient,
      CodexClientBuilder: MockCodexClientBuilder,
      CodexError: MockCodexError,
      CodexAuthError: MockCodexAuthError,
      CodexConnectionError: MockCodexConnectionError,
      CodexSessionError: MockCodexSessionError,
    };
  });
}

describe('sdk examples', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetMockState();
    registerSdkMock();
    exitSpy = vi.spyOn(process, 'exit');
    exitSpy.mockImplementation(((code?: Parameters<typeof process.exit>[0]) => {
      if (typeof code === 'number') {
        process.exitCode = code;
      } else if (typeof code === 'string') {
        const parsed = Number(code);
        process.exitCode = Number.isFinite(parsed) ? parsed : undefined;
      } else {
        process.exitCode = undefined;
      }
      return undefined as never;
    }) as typeof process.exit);
    process.exitCode = undefined;
  });

  afterEach(() => {
    exitSpy?.mockRestore();
  });

  it('runs the basic chat example to completion', async () => {
    mockState.eventsImplementation = () =>
      createEventStream([
        createEvent('notification', { content: 'Hello world' }),
        createEvent('response_completed', {}),
      ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../examples/basic-chat');

    expect(mockState.createConversation).toHaveBeenCalledTimes(1);
    expect(mockState.sendUserTurn).toHaveBeenCalledWith(
      'Say hello in JSON format.',
      expect.objectContaining({ summary: 'concise' }),
      expect.any(Object),
    );
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('auto-approves requests in the approval demo example', async () => {
    mockState.eventsImplementation = () =>
      createEventStream([
        createEvent('exec_approval_request', { id: 'exec-1' }),
        createEvent('apply_patch_approval_request', { id: 'patch-1' }),
        createEvent('response_completed', {}),
      ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../examples/approval-demo');

    expect(mockState.respondToExecApproval).toHaveBeenCalledWith('exec-1', 'approve');
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('handles the error-handling example without exiting', async () => {
    mockState.eventsImplementation = () => createEventStream([createEvent('response_completed', {})]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const originalExitCode = process.exitCode;

    await import('../../examples/error-handling');

    expect(mockState.sendUserTurn).toHaveBeenCalledWith(
      'Describe robust error handling strategies.',
      undefined,
      expect.any(Object),
    );
    expect(process.exitCode).toBe(originalExitCode ?? undefined);
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('streams deltas in the streaming example', async () => {
    mockState.eventsImplementation = () =>
      createEventStream([
        createEvent('response_delta', { delta: 'Hel' }),
        createEvent('response_delta', { delta: 'lo' }),
        createEvent('response_completed', { text: 'Hello' }),
      ]);

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../examples/streaming');

    expect(mockState.sendUserTurn).toHaveBeenCalledWith(
      'Explain how Codex streaming works in two sentences.',
      undefined,
      expect.any(Object),
    );
    expect(stdoutSpy).toHaveBeenCalled();
    const outputs = stdoutSpy.mock.calls.map((call) => (typeof call[0] === 'string' ? (call[0] as string) : ''));
    const joined = outputs.join('');
    expect(joined).toContain('Hel');
    expect(exitSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
    errorSpy.mockRestore();
  });

});
