import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import type { Mock } from 'vitest';

type AsyncEventMock = Mock<() => Promise<string | null>>;

let createConversationMock: Mock;
let submitMock: Mock;
let nextEventMock: AsyncEventMock;
let closeMock: Mock;
const nativeOptions: Array<{ codexHome?: string }> = [];

vi.mock('../src/internal/nativeModule', async () => {
  const actual = await vi.importActual<typeof import('../src/internal/nativeModule')>(
    '../src/internal/nativeModule',
  );

  return {
    ...actual,
    loadNativeModule: vi.fn(() => ({
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
          return 'test';
        }
      },
      version: () => 'test-version',
    })),
  };
});

import { CodexClient } from '../src/client/CodexClient';
import type { CodexClientConfig } from '../src/types/options';

interface SessionHandle {
  conversationId: string;
  submit: Mock;
  nextEvent: AsyncEventMock;
  close: Mock;
}

let session: SessionHandle;

function createClient(config: Partial<CodexClientConfig> = {}): CodexClient {
  return new CodexClient({ codexHome: '/tmp/codex', ...config });
}

beforeEach(() => {
  nativeOptions.splice(0, nativeOptions.length);
  createConversationMock = vi.fn();
  submitMock = vi.fn();
  nextEventMock = vi.fn();
  closeMock = vi.fn();
  session = {
    conversationId: 'conv-123',
    submit: submitMock,
    nextEvent: nextEventMock,
    close: closeMock,
  };
  createConversationMock.mockResolvedValue(session);
  submitMock.mockResolvedValue(undefined);
  closeMock.mockResolvedValue(undefined);
});

describe('CodexClient', () => {
  it('connects with resolved codexHome', async () => {
    const client = createClient({ codexHome: '~/codex-home' });
    await client.createConversation({ overrides: { model: 'gpt-5-codex' } });

    const resolvedHome = path.join(os.homedir(), 'codex-home');
    expect(nativeOptions[0]).toEqual({ codexHome: resolvedHome });
    expect(createConversationMock).toHaveBeenCalledWith({
      overrides: [{ key: 'model', value: 'gpt-5-codex' }],
    });

    await client.close();
  });

  it('sends user message submissions as JSON payload', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.sendMessage('Hello world');

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload).toMatchObject({
      op: {
        type: 'user_input',
        items: [{ type: 'text', text: 'Hello world' }],
      },
    });

    await client.close();
  });

  it('sends user turn with defaults and overrides', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.sendUserTurn('Iterate', {
      cwd: '/tmp/project',
      approvalPolicy: 'on-request',
      sandboxPolicy: {
        mode: 'workspace-write',
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
      },
      model: 'codex',
      effort: 'high',
      summary: 'detailed',
    });

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toMatchObject({
      type: 'user_turn',
      cwd: '/tmp/project',
      approval_policy: 'on-request',
      sandbox_policy: {
        mode: 'workspace-write',
        network_access: false,
      },
      model: 'gpt-5-codex',
      effort: 'high',
      summary: 'detailed',
    });
    expect(payload.op.items[0].text).toBe('Iterate');

    await client.close();
  });

  it('provides async iterator for events', async () => {
    const client = createClient();

    nextEventMock
      .mockResolvedValueOnce(JSON.stringify(makeEvent('session_configured')))
      .mockResolvedValueOnce(JSON.stringify(makeEvent('notification', { content: 'hi' })))
      .mockResolvedValueOnce(null);

    await client.createConversation();

    const events: string[] = [];
    for await (const evt of client.events()) {
      events.push(evt.msg.type);
    }

    expect(events).toContain('notification');

    await client.close();
  });

  it('invokes plugins around submissions and events', async () => {
    const beforeSubmit = vi.fn((submission) => submission);
    const afterEvent = vi.fn();
    const onError = vi.fn();

    const client = createClient({
      plugins: [
        {
          name: 'test-plugin',
          initialize: vi.fn(),
          beforeSubmit,
          afterEvent,
          onError,
        },
      ],
    });

    nextEventMock
      .mockResolvedValueOnce(JSON.stringify(makeEvent('notification')))
      .mockRejectedValueOnce(new Error('stream-failure'));

    const streamPromise = (async () => {
      for await (const _ of client.events()) {
        // iterate to trigger rejection
      }
    })();

    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);
    await client.sendMessage('Ping');

    await expect(streamPromise).rejects.toThrow('stream-failure');

    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(afterEvent).toHaveBeenCalledWith(expect.objectContaining({ msg: { type: 'notification' } }));
    expect(onError).toHaveBeenCalled();

    await client.close().catch(() => undefined);
  });

  it('overrides turn context through submissions', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.overrideTurnContext({
      cwd: '/tmp/workspace',
      approvalPolicy: 'never',
      sandboxPolicy: { mode: 'read-only' },
      model: 'codex',
      effort: 'high',
      summary: 'concise',
    });

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toMatchObject({
      type: 'override_turn_context',
      cwd: '/tmp/workspace',
      approval_policy: 'never',
      sandbox_policy: { mode: 'read-only' },
      model: 'gpt-5-codex',
      effort: 'high',
      summary: 'concise',
    });
  });

  it('validates override turn context input', async () => {
    const client = createClient();
    await client.createConversation();

    await expect(client.overrideTurnContext({})).rejects.toThrow(/at least one override property/);
    await expect(
      client.overrideTurnContext({ effort: 'invalid' as unknown as 'minimal' }),
    ).rejects.toThrow(/effort must be minimal/);
  });

  it('adds entries to history via submissions', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.addToHistory('Remember this');

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({ type: 'add_to_history', text: 'Remember this' });
  });

  it('rejects blank history entries', async () => {
    const client = createClient();
    await client.createConversation();

    await expect(client.addToHistory('   ')).rejects.toThrow(/cannot be empty/);
  });

  it('requests conversation path and shutdown submissions', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.getPath();
    await client.shutdown();

    expect(submitMock.mock.calls).toHaveLength(2);
    const firstPayload = JSON.parse(submitMock.mock.calls[0][0]);
    const secondPayload = JSON.parse(submitMock.mock.calls[1][0]);
    expect(firstPayload.op).toEqual({ type: 'get_path' });
    expect(secondPayload.op).toEqual({ type: 'shutdown' });
  });

  it('routes new event types through routeEvent', async () => {
    const client = createClient();
    const conversationPathListener = vi.fn();
    const shutdownListener = vi.fn();
    const turnContextListener = vi.fn();

    client.on('conversationPath', conversationPathListener);
    client.on('shutdownComplete', shutdownListener);
    client.on('turnContext', turnContextListener);

    const clientWithRoute = client as unknown as { routeEvent: (event: ReturnType<typeof makeEvent>) => void };

    clientWithRoute.routeEvent(
      makeEvent('conversation_path', { conversation_id: 'conv-123', path: '/tmp/history' }),
    );
    clientWithRoute.routeEvent(makeEvent('shutdown_complete'));
    clientWithRoute.routeEvent(
      makeEvent('turn_context', {
        cwd: '/tmp',
        approval_policy: 'on-request',
        sandbox_policy: {
          mode: 'workspace-write',
          network_access: false,
          exclude_tmpdir_env_var: false,
          exclude_slash_tmp: false,
        },
        model: 'gpt-5-codex',
        effort: 'medium',
        summary: 'auto',
      }),
    );

    expect(conversationPathListener).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/history' }));
    expect(shutdownListener).toHaveBeenCalledWith(expect.objectContaining({ type: 'shutdown_complete' }));
    expect(turnContextListener).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/tmp', model: 'gpt-5-codex' }),
    );
  });

  it('closes sessions gracefully', async () => {
    const client = createClient();
    let resolveNext: ((value: string | null) => void) | undefined;
    nextEventMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );

    await client.createConversation();

    const closePromise = client.close();
    resolveNext?.(null);

    await closePromise;
    expect(closeMock).toHaveBeenCalled();
  });

  it('checks model availability', async () => {
    const client = createClient();
    nextEventMock.mockResolvedValueOnce(null);

    const available = await client.testModelAvailability('codex');
    expect(available).toBe(true);
  });

  it('responds to patch approval requests with the correct payload', async () => {
    const client = createClient();
    nextEventMock.mockResolvedValueOnce(null);

    await client.createConversation();
    await client.respondToPatchApproval('patch-42', 'approve');

    expect(submitMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(submitMock.mock.calls.at(-1)?.[0] ?? '{}');
    expect(payload).toMatchObject({
      op: {
        type: 'patch_approval',
        id: 'patch-42',
        decision: 'approved',
      },
    });

    await client.close();
  });

  it('validates active sessions before responding to patch approvals', async () => {
    const client = createClient();

    await expect(client.respondToPatchApproval('patch-99', 'reject')).rejects.toThrow(
      'No active Codex session',
    );
  });
});

function makeEvent(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    msg: {
      type,
      ...extra,
    },
  };
}
