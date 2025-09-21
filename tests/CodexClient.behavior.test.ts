import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { CodexClientConfig } from '../src/types/options';
import type { CodexPlugin } from '../src/plugins/types';
import { CodexClient } from '../src/client/CodexClient';
import { CodexConnectionError, CodexSessionError } from '../src/errors/CodexError';
import * as retryModule from '../src/utils/retry';

interface MockSessionHandle {
  conversationId: string;
  submit: Mock;
  nextEvent: Mock<() => Promise<string | null>>;
  close: Mock;
}

type LoadNativeModule = typeof import('../src/internal/nativeModule')['loadNativeModule'];

let createConversationMock: Mock;
let submitMock: Mock;
let nextEventMock: Mock<() => Promise<string | null>>;
let closeMock: Mock;
let session: MockSessionHandle;
const nativeOptions: Array<{ codexHome?: string }> = [];

const loadNativeModuleSpy = vi.hoisted<LoadNativeModule>(() => vi.fn());

vi.mock('../src/internal/nativeModule', async () => {
  const actual = await vi.importActual<typeof import('../src/internal/nativeModule')>(
    '../src/internal/nativeModule',
  );

  return {
    ...actual,
    loadNativeModule: loadNativeModuleSpy,
  };
});

function createClient(config: Partial<CodexClientConfig> = {}): CodexClient {
  return new CodexClient({ codexHome: '/tmp/codex-home', ...config });
}

beforeEach(() => {
  nativeOptions.splice(0, nativeOptions.length);
  createConversationMock = vi.fn();
  submitMock = vi.fn();
  nextEventMock = vi.fn();
  closeMock = vi.fn();
  session = {
    conversationId: 'conv-456',
    submit: submitMock,
    nextEvent: nextEventMock,
    close: closeMock,
  };
  createConversationMock.mockResolvedValue(session);
  submitMock.mockResolvedValue(undefined);
  nextEventMock.mockResolvedValue(null);
  closeMock.mockResolvedValue(undefined);
  loadNativeModuleSpy.mockReset();
  loadNativeModuleSpy.mockImplementation(() => ({
    NativeCodex: class {
      options?: { codexHome?: string };

      constructor(options?: { codexHome?: string }) {
        this.options = options;
        nativeOptions.push(options ?? {});
      }

      createConversation(params?: unknown) {
        return createConversationMock(params);
      }

      getAuthMode() {
        return 'test-auth';
      }
    },
    version: () => 'test-version',
    cliVersion: () => 'test-version',
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CodexClient advanced behaviour', () => {
  it('registers plugins added after initialisation', async () => {
    const warn = vi.fn();
    const client = createClient({ plugins: [], logger: { warn } });
    const plugin: CodexPlugin = {
      name: 'late-plugin',
      initialize: vi.fn(() => Promise.reject(new Error('init failed'))),
    };

    await client.connect();
    client.registerPlugin(plugin);

    await Promise.resolve();
    expect(plugin.initialize).toHaveBeenCalledWith({ client, logger: { warn } });
    expect(warn).toHaveBeenCalledWith('Plugin initialization failed', {
      plugin: 'late-plugin',
      error: 'init failed',
    });

    const stringPlugin: CodexPlugin = {
      name: 'string-late',
      initialize: vi.fn(() => Promise.reject('init string failure')),
    };

    client.registerPlugin(stringPlugin);
    await Promise.resolve();
    expect(stringPlugin.initialize).toHaveBeenCalledWith({ client, logger: { warn } });
    expect(warn).toHaveBeenCalledWith('Plugin initialization failed', {
      plugin: 'string-late',
      error: 'init string failure',
    });
  });

  it('swallows plugin initialise errors during connect while logging', async () => {
    const warn = vi.fn();
    const plugin: CodexPlugin = {
      name: 'boot-plugin',
      initialize: vi.fn(() => {
        throw new Error('boot failed');
      }),
    };

    const client = createClient({ plugins: [plugin], logger: { warn } });
    await expect(client.connect()).resolves.toBeUndefined();
    expect(plugin.initialize).toHaveBeenCalledWith({ client, logger: { warn } });
    expect(warn).toHaveBeenCalledWith('Plugin initialization failed', {
      plugin: 'boot-plugin',
      error: 'boot failed',
    });
  });

  it('normalises non-error plugin initialise failures during connect', async () => {
    const warn = vi.fn();
    const plugin: CodexPlugin = {
      name: 'string-plugin',
      initialize: () => {
        throw 'string failure';
      },
    };

    const client = createClient({ plugins: [plugin], logger: { warn } });
    await expect(client.connect()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Plugin initialization failed', {
      plugin: 'string-plugin',
      error: 'string failure',
    });
  });

  it('returns early when already connected', async () => {
    const client = createClient();
    await client.connect();
    expect(loadNativeModuleSpy).toHaveBeenCalledTimes(1);
    await client.connect();
    expect(loadNativeModuleSpy).toHaveBeenCalledTimes(1);
  });

  it('wraps native loading failures in CodexConnectionError', async () => {
    loadNativeModuleSpy.mockImplementationOnce(() => {
      throw new Error('missing binding');
    });

    const client = createClient({ codexHome: '~' });
    await expect(client.connect()).rejects.toBeInstanceOf(CodexConnectionError);
  });

  it('wraps native constructor errors during connect', async () => {
    loadNativeModuleSpy.mockImplementationOnce(() => ({
      NativeCodex: class {
        constructor() {
          throw new Error('ctor');
        }
      },
      version: () => 'test-version',
      cliVersion: () => 'test-version',
    }));

    const client = createClient();
    await expect(client.connect()).rejects.toBeInstanceOf(CodexConnectionError);
  });

  it('omits codexHome when configuration is unset', async () => {
    const client = createClient({ codexHome: undefined });
    await client.connect();
    expect(nativeOptions.at(-1)).toEqual({});
  });

  it('annotates connection errors with environment codex home when available', async () => {
    loadNativeModuleSpy.mockImplementationOnce(() => {
      throw 'missing module';
    });

    const originalHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = '/env/codex';

    const client = createClient({ codexHome: undefined });

    try {
      await client.connect();
      throw new Error('Expected connect to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CodexConnectionError);
      expect(error).toMatchObject({
        details: {
          cause: 'missing module',
          codexHome: '/env/codex',
        },
      });
    } finally {
      if (originalHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalHome;
      }
    }
  });

  it('wraps unexpected retry helper failures with CodexConnectionError', async () => {
    const client = createClient();
    const withRetrySpy = vi.spyOn(retryModule, 'withRetry').mockImplementation(async (operation) => {
      await operation();
      throw new Error('unexpected retry failure');
    });

    try {
      await expect(client.connect()).rejects.toBeInstanceOf(CodexConnectionError);
      expect(withRetrySpy).toHaveBeenCalled();
      expect(loadNativeModuleSpy).toHaveBeenCalled();
    } finally {
      withRetrySpy.mockRestore();
    }
  });

  it('reinitialises session when createConversation is called twice', async () => {
    const secondSession: MockSessionHandle = {
      conversationId: 'conv-789',
      submit: vi.fn().mockResolvedValue(undefined),
      nextEvent: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(undefined),
    };
    createConversationMock.mockResolvedValueOnce(session).mockResolvedValueOnce(secondSession);

    const client = createClient();
    await client.createConversation();
    await client.createConversation();

    expect(closeMock).toHaveBeenCalled();
    await client.close();
    expect(secondSession.close).toHaveBeenCalled();
  });

  it('sends attachments in sendMessage and honours custom items in sendUserTurn', async () => {
    const client = createClient();
    await client.createConversation();

    await client.sendMessage('hello', { images: ['/tmp/image.png'] });

    const messagePayload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(messagePayload.op.items).toHaveLength(2);
    expect(messagePayload.op.items[1]).toMatchObject({ type: 'localImage', path: '/tmp/image.png' });

    const items = [{ type: 'text' as const, text: 'custom' }];
    await client.sendUserTurn('ignored', { items, model: 'codex', summary: 'brief' });
    const turnPayload = JSON.parse(submitMock.mock.calls[1][0]);
    expect(turnPayload.op.items).toEqual(items);
    expect(turnPayload.op.model).toBe('gpt-5-codex');
    expect(turnPayload.op.effort).toBe('medium');

    await client.sendUserTurn('explicit', { effort: 'high' });
    const explicitPayload = JSON.parse(submitMock.mock.calls[2][0]);
    expect(explicitPayload.op.effort).toBe('high');
  });

  it('falls back to configured default effort when model variants omit it', async () => {
    const client = createClient({ defaultEffort: 'high' });
    await client.createConversation();

    await client.sendUserTurn('question', { model: 'unknown-model' });
    const payload = JSON.parse(submitMock.mock.calls.at(-1)?.[0] ?? '');
    expect(payload.op.model).toBe('unknown-model');
    expect(payload.op.effort).toBe('high');
  });

  it('allows effort to remain undefined when no defaults are configured', async () => {
    const client = createClient({ defaultEffort: undefined });
    await client.createConversation();

    await client.sendUserTurn('question', { model: 'unknown-model' });
    const payload = JSON.parse(submitMock.mock.calls.at(-1)?.[0] ?? '');
    expect(payload.op.model).toBe('unknown-model');
    expect(payload.op.effort).toBeUndefined();
  });

  it('submits interrupt and approval decisions', async () => {
    const client = createClient();
    await client.createConversation();

    await client.interruptConversation();
    await client.respondToExecApproval('exec-1', 'approve');
    await client.respondToPatchApproval('patch-1', 'reject');

    const interrupt = JSON.parse(submitMock.mock.calls[0][0]);
    const exec = JSON.parse(submitMock.mock.calls[1][0]);
    const patch = JSON.parse(submitMock.mock.calls[2][0]);
    expect(interrupt.op.type).toBe('interrupt');
    expect(exec.op).toMatchObject({ type: 'exec_approval', decision: 'approved' });
    expect(patch.op).toMatchObject({ type: 'patch_approval', decision: 'denied' });
  });

  it('logs a warning when closing the session fails', async () => {
    const warn = vi.fn();
    closeMock.mockRejectedValueOnce('close failed');

    const client = createClient({ logger: { warn } });
    await client.createConversation();
    await expect(client.close()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Failed to close Codex session', { error: 'close failed' });
  });

  it('logs parsing failures when the native layer returns malformed events', async () => {
    const warn = vi.fn();
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw 'synthetic parse failure';
    });
    nextEventMock.mockResolvedValueOnce('raw-payload').mockResolvedValueOnce(null);

    const client = createClient({ logger: { warn } });
    await client.createConversation();

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(warn).toHaveBeenCalledWith('Failed to parse Codex event payload', {
        payload: 'raw-payload',
        error: 'synthetic parse failure',
      });
    } finally {
      parseSpy.mockRestore();
      await client.close();
    }
  });

  it('logs plugin onError hook failures surfaced during dispatch', async () => {
    const warn = vi.fn();
    nextEventMock.mockRejectedValueOnce(new Error('loop failed'));
    const plugin: CodexPlugin = {
      name: 'failure-handler',
      onError: vi.fn(() => {
        throw 'hook error';
      }),
    };

    const client = createClient({ logger: { warn }, plugins: [plugin] });
    client.on('error', () => undefined);
    await client.createConversation();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith('Plugin onError hook failed', {
      plugin: 'failure-handler',
      error: 'hook error',
    });
  });

  it('cleans up iterators when aborted or returned', async () => {
    const client = createClient();
    await client.createConversation();

    const controller = new AbortController();
    const iterator = client.events(controller.signal)[Symbol.asyncIterator]();

    const returnResult = await iterator.return?.();
    expect(returnResult).toEqual({ value: undefined, done: true });

    const abortedIterator = client.events(controller.signal)[Symbol.asyncIterator]();
    controller.abort();
    const nextResult = await abortedIterator.next();
    expect(nextResult.done).toBe(true);

    const throwingIterator = client.events()[Symbol.asyncIterator]();
    await expect(throwingIterator.throw?.(new Error('stop'))).rejects.toThrow('stop');

    const stringThrowIterator = client.events()[Symbol.asyncIterator]();
    await expect(stringThrowIterator.throw?.('manual stop')).rejects.toThrow('Iterator aborted');

    await client.close();
  });

  it('closes immediately when the abort signal is pre-aborted', async () => {
    const client = createClient();
    await client.createConversation();

    const controller = new AbortController();
    controller.abort();
    const iterator = client.events(controller.signal)[Symbol.asyncIterator]();
    const result = await iterator.next();
    expect(result.done).toBe(true);
  });

  it('cleans up listeners exactly once when events iterator ends', async () => {
    const client = createClient();
    await client.createConversation();

    const remove = vi.fn();
    const signal: AbortSignal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: remove,
      dispatchEvent: () => true,
      onabort: null,
      reason: undefined,
      throwIfAborted: () => {
        if (signal.aborted) {
          throw new Error('aborted');
        }
      },
    };

    const iterator = client.events(signal)[Symbol.asyncIterator]();
    await iterator.return?.();
    await iterator.return?.();

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('reports model availability failures gracefully', async () => {
    createConversationMock.mockRejectedValueOnce(new Error('nope'));

    const client = createClient();
    const available = await client.testModelAvailability('codex');
    expect(available).toBe(false);
  });

  it('requires native bindings before creating conversations', async () => {
    const client = createClient();
    client.connect = vi.fn().mockResolvedValue(undefined);
    const internal = client as unknown as { native?: unknown };
    internal.native = undefined;
    await expect(client.createConversation()).rejects.toBeInstanceOf(CodexConnectionError);
  });

  it('wraps submission failures in CodexSessionError', async () => {
    submitMock.mockRejectedValueOnce('session-down');

    const client = createClient();
    await client.createConversation();

    await expect(client.sendMessage('hi')).rejects.toBeInstanceOf(CodexSessionError);
  });

  it('throws when sending messages without a session', async () => {
    const client = createClient();
    await expect(client.sendMessage('hi')).rejects.toBeInstanceOf(CodexSessionError);
  });

  it('logs closing errors when ending a session', async () => {
    const warn = vi.fn();
    closeMock.mockRejectedValueOnce(new Error('close-fail'));
    const client = createClient({ logger: { warn } });
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);
    await client.close();
    expect(warn).toHaveBeenCalledWith('Failed to close Codex session', expect.objectContaining({ error: 'close-fail' }));
  });

  it('waits for the event loop to settle when closing an active session', async () => {
    const client = createClient();
    let resolveNext: (() => void) | undefined;
    nextEventMock.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveNext = () => resolve(null);
        }),
    );

    await client.createConversation();
    const closePromise = client.close();
    resolveNext?.();
    await closePromise;
  });

  it('runs plugin hooks and tolerates failures', async () => {
    const beforeSubmit = vi.fn((submission) => ({ ...submission, id: 'rewritten' }));
    const flakyBeforeSubmit = vi.fn(() => {
      throw new Error('broken');
    });
    const stringBeforeSubmit = vi.fn(() => {
      throw 'broken string';
    });
    const afterEvent = vi.fn();
    const failingAfterEvent = vi.fn(() => {
      throw new Error('fail after');
    });
    const stringAfterEvent = vi.fn(() => {
      throw 'fail after string';
    });
    const onError = vi.fn();
    const failingOnError = vi.fn(() => {
      throw new Error('fail onError');
    });

    const plugins: CodexPlugin[] = [
      { name: 'good', beforeSubmit, afterEvent, onError },
      { name: 'flaky', beforeSubmit: flakyBeforeSubmit, afterEvent: failingAfterEvent, onError: failingOnError },
      { name: 'stringy', beforeSubmit: stringBeforeSubmit, afterEvent: stringAfterEvent },
      { name: 'noop' },
    ];

    const client = createClient({ plugins, logger: { warn: vi.fn(), debug: vi.fn() } });

    nextEventMock
      .mockResolvedValueOnce(JSON.stringify({ id: 'evt-1', msg: { type: 'notification' } }))
      .mockResolvedValueOnce(null);

    await client.createConversation();
    await client.sendMessage('ping');

    const internal = client as unknown as {
      dispatchAfterEvent(event: { id: string; msg: { type: string } }): Promise<void>;
      dispatchOnError(error: unknown): Promise<void>;
    };
    await internal.dispatchAfterEvent({ id: 'evt-1', msg: { type: 'notification' } });
    await internal.dispatchOnError(new Error('stream failure'));

    expect(beforeSubmit).toHaveBeenCalled();
    expect(flakyBeforeSubmit).toHaveBeenCalled();
    expect(afterEvent).toHaveBeenCalled();
    expect(failingAfterEvent).toHaveBeenCalled();
    expect(stringBeforeSubmit).toHaveBeenCalled();
    expect(stringAfterEvent).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(failingOnError).toHaveBeenCalled();

    await client.close().catch(() => undefined);
  });

  it('handles malformed payloads during event streaming', async () => {
    nextEventMock
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify({ id: 'evt', msg: { type: 'notification' } }))
      .mockResolvedValueOnce(null);

    const warn = vi.fn();
    const client = createClient({ logger: { warn } });
    await client.createConversation();

    const seen: string[] = [];
    for await (const evt of client.events()) {
      seen.push(evt.msg.type);
    }

    expect(seen).toEqual(['notification']);
    expect(warn).toHaveBeenCalledWith('Failed to parse Codex event payload', expect.objectContaining({ payload: 'not json' }));
    await client.close();
  });

  it('emits errors when the event stream rejects', async () => {
    const client = createClient();
    const errorListener = vi.fn();
    client.on('error', errorListener);

    nextEventMock.mockRejectedValueOnce(new Error('loop failure'));

    await client.createConversation();
    await Promise.resolve();
    expect(errorListener).toHaveBeenCalled();
    await client.close().catch(() => undefined);
  });

  it('emits specialised events via routeEvent mapping', async () => {
    nextEventMock
      .mockResolvedValueOnce(JSON.stringify({ id: 'evt-1', msg: { type: 'session_configured' } }))
      .mockResolvedValueOnce(JSON.stringify({ id: 'evt-2', msg: { type: 'exec_approval_request', id: 'exec' } }))
      .mockResolvedValueOnce(
        JSON.stringify({ id: 'evt-3', msg: { type: 'apply_patch_approval_request', id: 'patch' } }),
      )
      .mockResolvedValueOnce(JSON.stringify({ id: 'evt-4', msg: { type: 'notification' } }))
      .mockResolvedValueOnce(null);

    const client = createClient();
    const configured = vi.fn();
    const exec = vi.fn();
    const patch = vi.fn();
    const notification = vi.fn();

    client.on('sessionConfigured', configured);
    client.on('execCommandApproval', exec);
    client.on('applyPatchApproval', patch);
    client.on('notification', notification);

    await client.createConversation();

    for await (const _ of client.events()) {
      // drain iterator
    }

    expect(configured).toHaveBeenCalled();
    expect(exec).toHaveBeenCalled();
    expect(patch).toHaveBeenCalled();
    expect(notification).toHaveBeenCalled();

    const internal = client as unknown as { routeEvent(event: { msg: { type: string } }): void };
    expect(() => internal.routeEvent({ msg: { type: 'unknown' } })).not.toThrow();
  });

  it('resolves CODEX_HOME from environment and expands ~ patterns', async () => {
    const client = createClient({ codexHome: undefined });
    const internal = client as unknown as { resolveCodexHome(): string | undefined };

    const originalEnv = process.env.CODEX_HOME;
    process.env.CODEX_HOME = '~/env-home';

    expect(internal.resolveCodexHome()).toBe(path.join(os.homedir(), 'env-home'));

    delete process.env.CODEX_HOME;
    expect(internal.resolveCodexHome()).toBeUndefined();

    process.env.CODEX_HOME = originalEnv;

    const backslashClient = new CodexClient({ codexHome: '~\\codex' });
    const backslashInternal = backslashClient as unknown as { resolveCodexHome(): string | undefined };
    expect(backslashInternal.resolveCodexHome()).toBe(path.join(os.homedir(), 'codex'));
  });

  it('does not restart the event loop when already active', async () => {
    const client = createClient();
    await client.createConversation();

    const internal = client as unknown as { startEventLoop(): void; eventLoop?: Promise<void>; };
    internal.eventLoop = Promise.resolve();
    internal.startEventLoop();
  });


  it('wrap helper methods expose structured errors', async () => {
    const client = createClient();
    const internal = client as unknown as {
      wrapConnectionError(message: string, cause: unknown, codexHome?: string): CodexConnectionError;
      wrapSessionError(message: string, cause: unknown, details?: unknown): CodexSessionError;
      generateRequestId(): string;
      startEventLoop(): void;
      initializePlugins(): Promise<void>;
    };

    const connErr = internal.wrapConnectionError('boom', new Error('cause'), '/tmp/codex');
    expect(connErr.code).toBe('CONNECTION');
    expect(connErr.details).toMatchObject({ codexHome: '/tmp/codex' });

    const sessionErr = internal.wrapSessionError('fail', 'plain');
    expect(sessionErr.code).toBe('SESSION');
    expect(sessionErr.details).toMatchObject({ cause: 'plain' });

    const sessionErrWithError = internal.wrapSessionError('boom', new Error('nope'), { reason: 'bad' });
    expect(sessionErrWithError.details).toMatchObject({ cause: 'nope', details: { reason: 'bad' } });

    const idA = internal.generateRequestId();
    const idB = internal.generateRequestId();
    expect(idB).not.toEqual(idA);

    internal.startEventLoop(); // no session yet, should no-op

    await internal.initializePlugins();
    await internal.initializePlugins();
  });
});
