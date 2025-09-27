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
const workspaceWriteBasePolicy = {
  mode: 'workspace-write' as const,
  network_access: false,
  exclude_tmpdir_env_var: false,
  exclude_slash_tmp: false,
};

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
      version: () => '0.42.0',
      cliVersion: () => '0.42.0',
    })),
  };
});

import { CodexClient } from '../src/client/CodexClient';
import type { CodexClientConfig, ReviewRequestInput } from '../src/types/options';
import type { SandboxPolicy } from '../src/bindings/SandboxPolicy';

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

  it('emits error and stops event loop when nextEvent rejects', async () => {
    const onErrorHook = vi.fn();
    const client = createClient({
      plugins: [
        {
          name: 'error-listener',
          onError: onErrorHook,
        },
      ],
    });

    const eventLoopError = new Error('event-loop-failure');
    nextEventMock.mockRejectedValueOnce(eventLoopError);

    const errorEvent = new Promise<unknown>((resolve) => client.once('error', resolve));
    const closedEvent = new Promise<void>((resolve) => client.once('eventStreamClosed', () => resolve()));

    await client.createConversation();

    const emittedError = await errorEvent;
    expect(emittedError).toBe(eventLoopError);
    expect(onErrorHook).toHaveBeenCalledTimes(1);
    expect(onErrorHook).toHaveBeenCalledWith(eventLoopError);

    await closedEvent;
    expect(nextEventMock).toHaveBeenCalledTimes(1);

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

    await expect(client.overrideTurnContext(undefined as any)).rejects.toThrow(
      /requires an options object/,
    );
    await expect(client.overrideTurnContext({})).rejects.toThrow(/at least one override property/);
    await expect(
      client.overrideTurnContext({ effort: 'invalid' as unknown as 'minimal' }),
    ).rejects.toThrow(/effort must be minimal/);
    await expect(client.overrideTurnContext({ cwd: '' })).rejects.toThrow(/cwd must be a non-empty/);
    await expect(
      client.overrideTurnContext({ approvalPolicy: 'invalid' as unknown as 'never' }),
    ).rejects.toThrow(/approvalPolicy must be a valid AskForApproval value/);
    await expect(client.overrideTurnContext({ model: '   ' })).rejects.toThrow(
      /model must be a non-empty string/,
    );
    await expect(
      client.overrideTurnContext({ summary: 'invalid' as unknown as 'auto' }),
    ).rejects.toThrow(/summary must be auto, concise, detailed or none/);

    await client.close().catch(() => undefined);
  });

  it('rejects non-object sandbox policies during override', async () => {
    await expectInvalidSandboxPolicy(null);
  });

  it.each([
    ['a non-boolean network_access value', { network_access: 'yes' }],
    ['a non-boolean exclude_tmpdir_env_var value', { exclude_tmpdir_env_var: 'nope' }],
    ['a non-boolean exclude_slash_tmp value', { exclude_slash_tmp: 'nah' }],
  ])('rejects workspace-write sandbox policy with %s', async (_, overrides) => {
    await expectInvalidSandboxPolicy({ ...workspaceWriteBasePolicy, ...overrides });
  });

  it.each([
    ['a non-array writable_roots value', { writable_roots: 'not-an-array' }],
    ['a writable_roots entry that is not a string', { writable_roots: ['/tmp', 42] }],
  ])('rejects workspace-write sandbox policy with %s', async (_, overrides) => {
    await expectInvalidSandboxPolicy({ ...workspaceWriteBasePolicy, ...overrides });
  });

  it('rejects sandbox policies with unknown modes', async () => {
    await expectInvalidSandboxPolicy({ mode: 'unsupported-mode' });
  });

  it('overrides turn context with workspace-write sandbox policy', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.overrideTurnContext({
      sandboxPolicy: {
        ...workspaceWriteBasePolicy,
        writable_roots: ['/workspace', '/tmp/project'],
      } as any,
    });

    const payload = JSON.parse(submitMock.mock.calls.at(-1)?.[0] ?? '{}');
    expect(payload.op).toMatchObject({
      sandbox_policy: {
        mode: 'workspace-write',
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
        writable_roots: ['/workspace', '/tmp/project'],
      },
    });

    await client.close();
  });

  it('overrides turn context with model resolution when effort is omitted', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.overrideTurnContext({ model: 'codex' });

    const payload = JSON.parse(submitMock.mock.calls.at(-1)?.[0] ?? '{}');
    expect(payload.op).toMatchObject({
      model: 'gpt-5-codex',
    });
    expect(payload.op.effort).toBeUndefined();

    await client.close();
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

    await expect(client.addToHistory(42 as any)).rejects.toThrow(/text must be a string/);
    await expect(client.addToHistory('   ')).rejects.toThrow(/cannot be empty/);

    await client.close();
  });

  it('requests specific history entries', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.getHistoryEntry({ offset: 2, logId: 42 });

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({
      type: 'get_history_entry_request',
      offset: 2,
      log_id: 42,
    });
  });

  it('validates history entry request options', async () => {
    const client = createClient();
    await client.createConversation();

    await expect(client.getHistoryEntry(null as any)).rejects.toThrow(/options must be an object/);
    await expect(client.getHistoryEntry({ offset: -1, logId: 2 })).rejects.toThrow(/non-negative/);
    await expect(client.getHistoryEntry({ offset: 1.2, logId: 2 })).rejects.toThrow(/non-negative/);
    await expect(client.getHistoryEntry({ offset: 1, logId: -2 })).rejects.toThrow(/non-negative/);
    await expect(client.getHistoryEntry({ offset: 1, logId: 3.1 })).rejects.toThrow(/non-negative/);

    await client.close().catch(() => undefined);
  });

  it('requests MCP tool listings', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.listMcpTools();

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({ type: 'list_mcp_tools' });
  });

  it('requests custom prompt listings', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.listCustomPrompts();

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({ type: 'list_custom_prompts' });
  });

  it('compacts the conversation context', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.compact();

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({ type: 'compact' });
  });

  it('submits review requests with normalization', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.review({ prompt: 'Check this', userFacingHint: 'Be thorough' });

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({
      type: 'review',
      review_request: { prompt: 'Check this', user_facing_hint: 'Be thorough' },
    });
  });

  it('accepts snake_case review hints without renormalizing', async () => {
    const client = createClient();
    await client.createConversation();
    nextEventMock.mockResolvedValueOnce(null);

    await client.review({ prompt: 'Check this', user_facing_hint: 'Focus on tests' } as any);

    const payload = JSON.parse(submitMock.mock.calls[0][0]);
    expect(payload.op).toEqual({
      type: 'review',
      review_request: { prompt: 'Check this', user_facing_hint: 'Focus on tests' },
    });

    await client.close();
  });

  it('validates review request input', async () => {
    const client = createClient();
    await client.createConversation();

    await expect(client.review(null as any)).rejects.toThrow(/must be an object/);
    await expect(client.review({ prompt: '', userFacingHint: 'ok' })).rejects.toThrow(/non-empty string/);
    await expect(client.review({ prompt: 'Check', userFacingHint: '' })).rejects.toThrow(/non-empty string/);
    await expect(client.review({ prompt: 'Check' } as unknown as ReviewRequestInput)).rejects.toThrow(
      /userFacingHint must be a non-empty string/,
    );

    await client.close().catch(() => undefined);
  });

  it('rejects snake_case review hints when blank', async () => {
    const client = createClient();
    await client.createConversation();

    await expect(
      client.review({ prompt: 'Check this', user_facing_hint: '   ' } as any),
    ).rejects.toThrow(/non-empty string/);

    await client.close().catch(() => undefined);
  });

  describe('type guard helpers', () => {
    it('returns false when event types do not match the guard', () => {
      const client = createClient();
      const guards = client as any;

      expect(guards.isGetHistoryEntryResponseEventMessage({ type: 'notification' })).toBe(false);
      expect(guards.isMcpListToolsResponseEventMessage({ type: 'notification' })).toBe(false);
      expect(guards.isListCustomPromptsResponseEventMessage({ type: 'notification' })).toBe(false);
      expect(guards.isEnteredReviewModeEventMessage({ type: 'notification' })).toBe(false);
    });

    it('validates payload shapes before emitting guard-specific events', () => {
      const client = createClient();
      const guards = client as any;

      expect(
        guards.isGetHistoryEntryResponseEventMessage({
          type: 'get_history_entry_response',
          offset: '1',
          log_id: 2,
        }),
      ).toBe(false);

      expect(
        guards.isMcpListToolsResponseEventMessage({
          type: 'mcp_list_tools_response',
          tools: null,
        }),
      ).toBe(false);

      expect(
        guards.isListCustomPromptsResponseEventMessage({
          type: 'list_custom_prompts_response',
          custom_prompts: 'not-an-array',
        }),
      ).toBe(false);
      expect(
        guards.isListCustomPromptsResponseEventMessage({
          type: 'list_custom_prompts_response',
          custom_prompts: [null],
        }),
      ).toBe(false);
      expect(
        guards.isListCustomPromptsResponseEventMessage({
          type: 'list_custom_prompts_response',
          custom_prompts: [
            { name: 'default', path: '/tmp/prompt', content: 42 } as unknown as {
              name: string;
              path: string;
              content: string;
            },
          ],
        }),
      ).toBe(false);

      expect(
        guards.isEnteredReviewModeEventMessage({
          type: 'entered_review_mode',
          prompt: 'Check this',
          user_facing_hint: 12,
        }),
      ).toBe(false);
    });
  });

  describe('overrideTurnContext sandbox policy validation', () => {
    it('accepts workspace-write sandbox policies with valid configuration', async () => {
      const client = createClient();
      await client.createConversation();

      const policy: SandboxPolicy = {
        mode: 'workspace-write',
        network_access: true,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: true,
        writable_roots: ['/tmp/project'],
      };

      await client.overrideTurnContext({ sandboxPolicy: policy });

      const payload = JSON.parse(submitMock.mock.calls.at(-1)?.[0] ?? '{}');
      expect(payload.op).toMatchObject({ sandbox_policy: policy });

      await client.close();
    });

    it('rejects non-object sandbox policies', async () => {
      const client = createClient();
      await client.createConversation();

      await expect(
        client.overrideTurnContext({ sandboxPolicy: 'invalid' as unknown as SandboxPolicy }),
      ).rejects.toThrow('overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value');

      await client.close();
    });

    it('rejects workspace-write sandbox policies with non-boolean network access', async () => {
      const client = createClient();
      await client.createConversation();

      const policy = {
        mode: 'workspace-write',
        network_access: 'yes',
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
      } as unknown as SandboxPolicy;

      await expect(client.overrideTurnContext({ sandboxPolicy: policy })).rejects.toThrow(
        'overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value',
      );

      await client.close();
    });

    it('rejects workspace-write sandbox policies with non-boolean exclude_tmpdir_env_var', async () => {
      const client = createClient();
      await client.createConversation();

      const policy = {
        mode: 'workspace-write',
        network_access: false,
        exclude_tmpdir_env_var: 'nope',
        exclude_slash_tmp: false,
      } as unknown as SandboxPolicy;

      await expect(client.overrideTurnContext({ sandboxPolicy: policy })).rejects.toThrow(
        'overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value',
      );

      await client.close();
    });

    it('rejects workspace-write sandbox policies with non-boolean exclude_slash_tmp', async () => {
      const client = createClient();
      await client.createConversation();

      const policy = {
        mode: 'workspace-write',
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: 'nah',
      } as unknown as SandboxPolicy;

      await expect(client.overrideTurnContext({ sandboxPolicy: policy })).rejects.toThrow(
        'overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value',
      );

      await client.close();
    });

    it('rejects workspace-write sandbox policies with invalid writable roots entries', async () => {
      const client = createClient();
      await client.createConversation();

      const policy = {
        mode: 'workspace-write',
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
        writable_roots: ['/tmp/project', 42],
      } as unknown as SandboxPolicy;

      await expect(client.overrideTurnContext({ sandboxPolicy: policy })).rejects.toThrow(
        'overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value',
      );

      await client.close();
    });

    it('rejects sandbox policies with unknown modes', async () => {
      const client = createClient();
      await client.createConversation();

      const policy = { mode: 'unsupported-mode' } as unknown as SandboxPolicy;

      await expect(client.overrideTurnContext({ sandboxPolicy: policy })).rejects.toThrow(
        'overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value',
      );

      await client.close();
    });
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
    const sessionConfiguredListener = vi.fn();
    const execApprovalListener = vi.fn();
    const patchApprovalListener = vi.fn();
    const notificationListener = vi.fn();
    const conversationPathListener = vi.fn();
    const shutdownListener = vi.fn();
    const turnContextListener = vi.fn();
    const historyEntryListener = vi.fn();
    const mcpToolsListener = vi.fn();
    const customPromptsListener = vi.fn();
    const enteredReviewListener = vi.fn();
    const exitedReviewListener = vi.fn();

    client.on('sessionConfigured', sessionConfiguredListener);
    client.on('execCommandApproval', execApprovalListener);
    client.on('applyPatchApproval', patchApprovalListener);
    client.on('notification', notificationListener);
    client.on('conversationPath', conversationPathListener);
    client.on('shutdownComplete', shutdownListener);
    client.on('turnContext', turnContextListener);
    client.on('historyEntry', historyEntryListener);
    client.on('mcpTools', mcpToolsListener);
    client.on('customPrompts', customPromptsListener);
    client.on('enteredReviewMode', enteredReviewListener);
    client.on('exitedReviewMode', exitedReviewListener);

    const clientWithRoute = client as unknown as { routeEvent: (event: ReturnType<typeof makeEvent>) => void };

    clientWithRoute.routeEvent(
      makeEvent('session_configured', {
        session_id: 'conv-123',
        model: 'gpt-5-codex',
        history_log_id: 12,
        history_entry_count: 3,
        rollout_path: '/tmp/rollout.log',
      }),
    );
    clientWithRoute.routeEvent(
      makeEvent('conversation_path', { conversation_id: 'conv-123', path: '/tmp/history' }),
    );
    clientWithRoute.routeEvent(makeEvent('shutdown_complete'));
    clientWithRoute.routeEvent(
      makeEvent('exec_approval_request', {
        call_id: 'exec-1',
        command: ['ls', '-la'],
        cwd: '/tmp',
        reason: 'list directory',
        id: 'approval-1',
      }),
    );
    clientWithRoute.routeEvent(
      makeEvent('apply_patch_approval_request', {
        call_id: 'patch-1',
        changes: {
          '/tmp/file.txt': {
            update: {
              unified_diff: '---',
              move_path: null,
            },
          },
        },
        reason: 'update file',
        grant_root: '/tmp',
        id: 'patch-1',
      }),
    );
    clientWithRoute.routeEvent(makeEvent('notification', { content: 'background work done' }));
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
    clientWithRoute.routeEvent(
      makeEvent('get_history_entry_response', {
        offset: 1,
        log_id: 4,
        entry: { conversation_id: 'conv-123', ts: 123, text: 'hi' },
      }),
    );
    clientWithRoute.routeEvent(
      makeEvent('mcp_list_tools_response', {
        tools: {
          'example/tool': {
            name: 'tool',
          },
        },
      }),
    );
    clientWithRoute.routeEvent(
      makeEvent('list_custom_prompts_response', {
        custom_prompts: [{ name: 'default', path: '/tmp/prompt', content: 'prompt' }],
      }),
    );
    clientWithRoute.routeEvent(
      makeEvent('entered_review_mode', {
        prompt: 'Check this',
        user_facing_hint: 'Focus on tests',
      }),
    );
    clientWithRoute.routeEvent(
      makeEvent('exited_review_mode', {
        review_output: {
          findings: [],
          overall_correctness: 'correct',
          overall_explanation: 'looks good',
          overall_confidence_score: 0.9,
        },
      }),
    );

    expect(sessionConfiguredListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session_configured',
        session_id: 'conv-123',
        model: 'gpt-5-codex',
      }),
    );
    expect(conversationPathListener).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/history' }));
    expect(shutdownListener).toHaveBeenCalledWith(expect.objectContaining({ type: 'shutdown_complete' }));
    expect(execApprovalListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'exec_approval_request',
        command: ['ls', '-la'],
        cwd: '/tmp',
      }),
    );
    expect(patchApprovalListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'apply_patch_approval_request',
        changes: expect.objectContaining({ '/tmp/file.txt': expect.any(Object) }),
      }),
    );
    expect(notificationListener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notification', content: 'background work done' }),
    );
    expect(turnContextListener).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/tmp', model: 'gpt-5-codex' }),
    );
    expect(historyEntryListener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'get_history_entry_response', offset: 1, log_id: 4 }),
    );
    expect(mcpToolsListener).toHaveBeenCalledWith(expect.objectContaining({ tools: expect.any(Object) }));
    expect(customPromptsListener).toHaveBeenCalledWith(
      expect.objectContaining({ custom_prompts: [{ name: 'default', path: '/tmp/prompt', content: 'prompt' }] }),
    );
    expect(enteredReviewListener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'entered_review_mode', prompt: 'Check this' }),
    );
    expect(exitedReviewListener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exited_review_mode', review_output: expect.any(Object) }),
    );
  });

  it('prevents guard-protected events from emitting when payloads are invalid', () => {
    const client = createClient();
    const historyEntryListener = vi.fn();
    const mcpToolsListener = vi.fn();
    const customPromptsListener = vi.fn();
    const enteredReviewListener = vi.fn();

    client.on('historyEntry', historyEntryListener);
    client.on('mcpTools', mcpToolsListener);
    client.on('customPrompts', customPromptsListener);
    client.on('enteredReviewMode', enteredReviewListener);

    const clientWithRoute = client as unknown as { routeEvent: (event: ReturnType<typeof makeEvent>) => void };

    clientWithRoute.routeEvent(
      makeEvent('get_history_entry_response', { offset: '0', log_id: 1 }),
    );
    clientWithRoute.routeEvent(
      makeEvent('mcp_list_tools_response', { tools: null }),
    );
    clientWithRoute.routeEvent(
      makeEvent('list_custom_prompts_response', { custom_prompts: ['invalid'] }),
    );
    clientWithRoute.routeEvent(
      makeEvent('entered_review_mode', { prompt: 'Check this', user_facing_hint: 0 }),
    );

    expect(historyEntryListener).not.toHaveBeenCalled();
    expect(mcpToolsListener).not.toHaveBeenCalled();
    expect(customPromptsListener).not.toHaveBeenCalled();
    expect(enteredReviewListener).not.toHaveBeenCalled();
  });

  it('emits errors and stops the event loop when nextEvent throws', async () => {
    const error = new Error('event loop failure');
    const onErrorHook = vi.fn().mockResolvedValue(undefined);
    const client = createClient({ plugins: [{ name: 'onError', onError: onErrorHook }] });
    const closed = new Promise<void>((resolve) => client.once('eventStreamClosed', () => resolve()));
    const errorListener = vi.fn();
    client.on('error', errorListener);

    nextEventMock.mockRejectedValueOnce(error);

    await client.createConversation();

    await closed;

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledWith(error);
    expect(onErrorHook).toHaveBeenCalledTimes(1);
    expect(onErrorHook).toHaveBeenCalledWith(error);
    expect(nextEventMock).toHaveBeenCalledTimes(1);

    await client.close();
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

async function expectInvalidSandboxPolicy(policy: unknown): Promise<void> {
  const client = createClient();
  try {
    await client.createConversation();
    const overridePromise = client.overrideTurnContext({ sandboxPolicy: policy as any });
    await expect(overridePromise).rejects.toThrow(/sandboxPolicy must be a valid SandboxPolicy value/);
  } finally {
    await client.close().catch(() => undefined);
  }
}
