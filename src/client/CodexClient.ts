import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import type { InputItem } from '../bindings/InputItem';
import type { AskForApproval } from '../bindings/AskForApproval';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { ReasoningEffort } from '../bindings/ReasoningEffort';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { FileChange } from '../bindings/FileChange';
import type { CodexEvent, CodexEventMessage } from '../types/events';
import type {
  CodexClientConfig,
  CreateConversationOptions,
  GetHistoryEntryRequestOptions,
  OverrideTurnContextOptions,
  ReviewRequestInput,
  SendMessageOptions,
  SendUserTurnOptions,
} from '../types/options';
import type { ReviewRequest, SubmissionEnvelope } from '../internal/submissions';
import {
  createAddToHistorySubmission,
  createCompactSubmission,
  createExecApprovalSubmission,
  createGetHistoryEntryRequestSubmission,
  createGetPathSubmission,
  createInterruptSubmission,
  createListCustomPromptsSubmission,
  createListMcpToolsSubmission,
  createOverrideTurnContextSubmission,
  createPatchApprovalSubmission,
  createReviewSubmission,
  createShutdownSubmission,
  createUserInputSubmission,
  createUserTurnSubmission,
} from '../internal/submissions';
import {
  loadNativeModule,
  type NativeCodexInstance,
  type CodexSessionHandle,
  formatOverrides,
} from '../internal/nativeModule';
import { AsyncEventQueue } from '../internal/AsyncEventQueue';
import { CodexConnectionError, CodexError, CodexSessionError } from '../errors/CodexError';
import type { PartialCodexLogger } from '../utils/logger';
import { log } from '../utils/logger';
import { withRetry } from '../utils/retry';
import type { CodexPlugin } from '../plugins/types';
import { resolveModelVariant } from '../utils/models';

const EVENT_STREAM_CLOSED = 'eventStreamClosed';
const DEFAULT_MODEL = 'gpt-5-codex';
const DEFAULT_SUMMARY: ReasoningSummary = 'auto';
const DEFAULT_APPROVAL_POLICY: AskForApproval = 'on-request';
const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  mode: 'workspace-write',
  network_access: false,
  exclude_tmpdir_env_var: false,
  exclude_slash_tmp: false,
};

const APPROVAL_POLICY_VALUES: readonly AskForApproval[] = ['untrusted', 'on-failure', 'on-request', 'never'];
const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
const REASONING_SUMMARY_VALUES: readonly ReasoningSummary[] = ['auto', 'concise', 'detailed', 'none'];

export class CodexClient extends EventEmitter {
  private native?: NativeCodexInstance;
  private session?: CodexSessionHandle;
  private requestCounter = 0;
  private eventLoop?: Promise<void>;
  private abortEventLoop = false;
  protected readonly logger: PartialCodexLogger;
  private readonly plugins: CodexPlugin[];
  private pluginsInitialized = false;

  constructor(private readonly config: CodexClientConfig = {}) {
    super();
    this.logger = config.logger ?? {};
    this.plugins = [...(config.plugins ?? [])];
  }

  registerPlugin(plugin: CodexPlugin): void {
    this.plugins.push(plugin);
    if (this.pluginsInitialized && plugin.initialize) {
      const result = plugin.initialize({ client: this, logger: this.logger });
      if (result) {
        Promise.resolve(result).catch((error: unknown) => {
          log(this.logger, 'warn', 'Plugin initialization failed', {
            plugin: plugin.name,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  }

  async connect(): Promise<void> {
    if (this.native) {
      return;
    }

    const attempt = async () => {
      let module;
      try {
        module = loadNativeModule({
          modulePath: this.config.nativeModulePath,
          logger: this.logger,
        });
      } catch (error) {
        throw this.wrapConnectionError('Failed to load Codex native module', error);
      }

      const ctor = module.NativeCodex;
      const codexHome = this.resolveCodexHome();
      try {
        this.native = new ctor(codexHome ? { codexHome } : undefined);
      } catch (error) {
        throw this.wrapConnectionError('Failed to initialise Codex native bindings', error, codexHome);
      }

      await this.initializePlugins();
      this.emit('connected');
    };

    try {
      await withRetry(attempt, this.config.retryPolicy, this.logger, 'connect');
    } catch (error) {
      this.native = undefined;
      if (error instanceof CodexError) {
        throw error;
      }
      throw this.wrapConnectionError('Codex connection failed', error);
    }
  }

  async createConversation(options: CreateConversationOptions = {}): Promise<string> {
    if (this.session) {
      await this.closeSession();
    }

    await this.connect();
    if (!this.native) {
      throw new CodexConnectionError('Native bindings not initialised');
    }

    const overrides = formatOverrides(options.overrides);
    try {
      this.session = await this.native.createConversation(overrides ? { overrides } : undefined);
    } catch (error) {
      throw this.wrapSessionError('Failed to create Codex conversation', error, options.overrides);
    }

    this.startEventLoop();
    return this.session.conversationId;
  }

  async sendMessage(text: string, options: SendMessageOptions = {}): Promise<void> {
    const session = this.requireSession();
    const items: InputItem[] = [
      {
        type: 'text',
        text,
      },
    ];

    for (const i of options.images ?? []) {
      items.push({ type: 'localImage', path: i });
    }

    const submission = createUserInputSubmission(this.generateRequestId(), items);
    await this.submit(session, submission);
  }

  async sendUserTurn(text: string, options: SendUserTurnOptions = {}): Promise<void> {
    const session = this.requireSession();

    const items = options.items ?? [
      {
        type: 'text' as const,
        text,
      },
    ];

    const resolved = resolveModelVariant(
      options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
      options.effort ?? this.config.defaultEffort,
    );

    const submission = createUserTurnSubmission(this.generateRequestId(), {
      items,
      cwd: options.cwd ?? process.cwd(),
      approvalPolicy: options.approvalPolicy ?? this.config.approvalPolicy ?? DEFAULT_APPROVAL_POLICY,
      sandboxPolicy: options.sandboxPolicy ?? this.config.sandboxPolicy ?? DEFAULT_SANDBOX_POLICY,
      model: resolved.model,
      effort: options.effort ?? resolved.effort ?? this.config.defaultEffort,
      summary: options.summary ?? this.config.defaultSummary ?? DEFAULT_SUMMARY,
    });

    await this.submit(session, submission);
  }

  async interruptConversation(): Promise<void> {
    const session = this.requireSession();
    const submission = createInterruptSubmission(this.generateRequestId());
    await this.submit(session, submission);
  }

  async respondToExecApproval(requestId: string, decision: 'approve' | 'reject'): Promise<void> {
    const session = this.requireSession();
    const submission = createExecApprovalSubmission(this.generateRequestId(), {
      id: requestId,
      decision,
    });
    await this.submit(session, submission);
  }

  async respondToPatchApproval(requestId: string, decision: 'approve' | 'reject'): Promise<void> {
    const session = this.requireSession();
    const submission = createPatchApprovalSubmission(this.generateRequestId(), {
      id: requestId,
      decision,
    });
    await this.submit(session, submission);
  }

  async overrideTurnContext(options: OverrideTurnContextOptions): Promise<void> {
    if (!options || typeof options !== 'object') {
      throw new TypeError('overrideTurnContext requires an options object');
    }

    const hasOverride =
      options.cwd !== undefined ||
      options.approvalPolicy !== undefined ||
      options.sandboxPolicy !== undefined ||
      options.model !== undefined ||
      options.effort !== undefined ||
      options.summary !== undefined;

    if (!hasOverride) {
      throw new TypeError('overrideTurnContext requires at least one override property');
    }

    const normalized: OverrideTurnContextOptions = {};

    if (options.cwd !== undefined) {
      if (typeof options.cwd !== 'string' || !options.cwd.trim()) {
        throw new TypeError('overrideTurnContext cwd must be a non-empty string when provided');
      }
      normalized.cwd = options.cwd.trim();
    }

    if (options.approvalPolicy !== undefined) {
      if (!isAskForApprovalValue(options.approvalPolicy)) {
        throw new TypeError('overrideTurnContext approvalPolicy must be a valid AskForApproval value');
      }
      normalized.approvalPolicy = options.approvalPolicy;
    }

    if (options.sandboxPolicy !== undefined) {
      if (!isSandboxPolicyValue(options.sandboxPolicy)) {
        throw new TypeError('overrideTurnContext sandboxPolicy must be a valid SandboxPolicy value');
      }
      normalized.sandboxPolicy = options.sandboxPolicy;
    }

    let normalizedEffort: ReasoningEffort | null | undefined = options.effort;
    if (normalizedEffort !== undefined && normalizedEffort !== null && !isReasoningEffortValue(normalizedEffort)) {
      throw new TypeError('overrideTurnContext effort must be minimal, low, medium, high or null');
    }

    if (options.model !== undefined) {
      if (typeof options.model !== 'string' || !options.model.trim()) {
        throw new TypeError('overrideTurnContext model must be a non-empty string when provided');
      }
      const trimmedModel = options.model.trim();
      const effortForResolution =
        normalizedEffort !== undefined && normalizedEffort !== null ? normalizedEffort : undefined;
      const resolved = resolveModelVariant(trimmedModel, effortForResolution);
      normalized.model = resolved.model;
      if (normalizedEffort !== undefined && normalizedEffort !== null) {
        normalizedEffort = resolved.effort;
      }
    }

    if (normalizedEffort !== undefined) {
      normalized.effort = normalizedEffort;
    }

    if (options.summary !== undefined) {
      if (!isReasoningSummaryValue(options.summary)) {
        throw new TypeError('overrideTurnContext summary must be auto, concise, detailed or none');
      }
      normalized.summary = options.summary;
    }

    const session = this.requireSession();
    const submission = createOverrideTurnContextSubmission(this.generateRequestId(), normalized);
    await this.submit(session, submission);
  }

  async addToHistory(text: string): Promise<void> {
    if (typeof text !== 'string') {
      throw new TypeError('addToHistory text must be a string');
    }
    if (!text.trim()) {
      throw new TypeError('addToHistory text cannot be empty');
    }

    const session = this.requireSession();
    const submission = createAddToHistorySubmission(this.generateRequestId(), { text });
    await this.submit(session, submission);
  }

  async getHistoryEntry(options: GetHistoryEntryRequestOptions): Promise<void> {
    const normalized = this.normalizeGetHistoryEntryOptions(options);
    const session = this.requireSession();
    const submission = createGetHistoryEntryRequestSubmission(this.generateRequestId(), normalized);
    await this.submit(session, submission);
  }

  async listMcpTools(): Promise<void> {
    const session = this.requireSession();
    const submission = createListMcpToolsSubmission(this.generateRequestId());
    await this.submit(session, submission);
  }

  async listCustomPrompts(): Promise<void> {
    const session = this.requireSession();
    const submission = createListCustomPromptsSubmission(this.generateRequestId());
    await this.submit(session, submission);
  }

  async compact(): Promise<void> {
    const session = this.requireSession();
    const submission = createCompactSubmission(this.generateRequestId());
    await this.submit(session, submission);
  }

  async review(request: ReviewRequestInput): Promise<void> {
    const reviewRequest = this.normalizeReviewRequest(request);
    const session = this.requireSession();
    const submission = createReviewSubmission(this.generateRequestId(), { reviewRequest });
    await this.submit(session, submission);
  }

  async getPath(): Promise<void> {
    const session = this.requireSession();
    const submission = createGetPathSubmission(this.generateRequestId());
    await this.submit(session, submission);
  }

  async shutdown(): Promise<void> {
    const session = this.requireSession();
    const submission = createShutdownSubmission(this.generateRequestId());
    await this.submit(session, submission);
  }

  async close(): Promise<void> {
    await this.closeSession();
  }

  events(signal?: AbortSignal): AsyncIterable<CodexEvent> {
    const queue = new AsyncEventQueue<CodexEvent>();

    const onEvent = (event: CodexEvent) => queue.enqueue(event);
    const onError = (error: unknown) => {
      queue.fail(error);
      cleanup();
    };
    const onClosed = () => {
      queue.close();
      cleanup();
    };

    this.on('event', onEvent);
    this.on('error', onError);
    this.on(EVENT_STREAM_CLOSED, onClosed);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      this.off('event', onEvent);
      this.off('error', onError);
      this.off(EVENT_STREAM_CLOSED, onClosed);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    };

    const abortHandler = () => {
      queue.close();
      cleanup();
    };

    if (signal) {
      if (signal.aborted) {
        queue.close();
        cleanup();
      } else {
        signal.addEventListener('abort', abortHandler);
      }
    }

    return {
      [Symbol.asyncIterator]: () => ({
        next: () => queue.next(),
        return: () => {
          queue.close();
          cleanup();
          return Promise.resolve({ value: undefined as unknown as CodexEvent, done: true });
        },
        throw: (err) => {
          cleanup();
          const normalized = err instanceof Error ? err : new Error('Iterator aborted', { cause: err });
          return Promise.reject(normalized);
        },
      }),
    };
  }

  async testModelAvailability(model: string): Promise<boolean> {
    try {
      await this.createConversation({
        overrides: { model },
      });
      await this.closeSession();
      return true;
    } catch {
      return false;
    }
  }

  private normalizeGetHistoryEntryOptions(
    options: GetHistoryEntryRequestOptions,
  ): GetHistoryEntryRequestOptions {
    if (!options || typeof options !== 'object') {
      throw new TypeError('getHistoryEntry options must be an object');
    }

    const { offset, logId } = options;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TypeError('getHistoryEntry offset must be a non-negative integer');
    }
    if (!Number.isSafeInteger(logId) || logId < 0) {
      throw new TypeError('getHistoryEntry logId must be a non-negative integer');
    }

    return { offset, logId };
  }

  private normalizeReviewRequest(request: ReviewRequestInput): ReviewRequest {
    if (!request || typeof request !== 'object') {
      throw new TypeError('review request must be an object');
    }

    const { prompt } = request;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new TypeError('review prompt must be a non-empty string');
    }

    let hintSource: unknown;
    if ('user_facing_hint' in request) {
      hintSource = request.user_facing_hint;
    } else if ('userFacingHint' in request) {
      hintSource = request.userFacingHint;
    }
    if (typeof hintSource !== 'string' || !hintSource.trim()) {
      throw new TypeError('review userFacingHint must be a non-empty string');
    }

    return {
      prompt: prompt.trim(),
      user_facing_hint: hintSource.trim(),
    };
  }

  private async submit(session: CodexSessionHandle, submission: SubmissionEnvelope): Promise<void> {
    const processed = await this.applyBeforeSubmit(submission);
    try {
      await session.submit(JSON.stringify(processed));
    } catch (error) {
      throw this.wrapSessionError('Failed to submit request to Codex session', error, processed);
    }
  }

  private async applyBeforeSubmit(submission: SubmissionEnvelope): Promise<SubmissionEnvelope> {
    let current = submission;
    for (const plugin of this.plugins) {
      if (!plugin.beforeSubmit) {
        continue;
      }
      try {
        const next = await plugin.beforeSubmit(current);
        if (next) {
          current = next;
        }
      } catch (error) {
        log(this.logger, 'warn', 'Plugin beforeSubmit hook failed', {
          plugin: plugin.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return current;
  }

  private async dispatchAfterEvent(event: CodexEvent): Promise<void> {
    for (const plugin of this.plugins) {
      if (!plugin.afterEvent) {
        continue;
      }
      try {
        await plugin.afterEvent(event);
      } catch (error) {
        log(this.logger, 'warn', 'Plugin afterEvent hook failed', {
          plugin: plugin.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private isGetHistoryEntryResponseEventMessage(
    msg: CodexEventMessage,
  ): msg is GetHistoryEntryResponseEventMessage {
    if (msg.type !== 'get_history_entry_response') {
      return false;
    }

    const candidate = msg as { offset?: unknown; log_id?: unknown };
    return typeof candidate.offset === 'number' && typeof candidate.log_id === 'number';
  }

  private isMcpListToolsResponseEventMessage(
    msg: CodexEventMessage,
  ): msg is McpListToolsResponseEventMessage {
    if (msg.type !== 'mcp_list_tools_response') {
      return false;
    }

    const candidate = msg as { tools?: unknown };
    return typeof candidate.tools === 'object' && candidate.tools !== null;
  }

  private isListCustomPromptsResponseEventMessage(
    msg: CodexEventMessage,
  ): msg is ListCustomPromptsResponseEventMessage {
    if (msg.type !== 'list_custom_prompts_response') {
      return false;
    }

    const candidate = msg as { custom_prompts?: unknown };
    if (!Array.isArray(candidate.custom_prompts)) {
      return false;
    }

    return candidate.custom_prompts.every((prompt) => {
      if (!prompt || typeof prompt !== 'object') {
        return false;
      }

      const entry = prompt as { name?: unknown; path?: unknown; content?: unknown };
      return (
        typeof entry.name === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.content === 'string'
      );
    });
  }

  private isEnteredReviewModeEventMessage(
    msg: CodexEventMessage,
  ): msg is EnteredReviewModeEventMessage {
    if (msg.type !== 'entered_review_mode') {
      return false;
    }

    const candidate = msg as { prompt?: unknown; user_facing_hint?: unknown };
    return typeof candidate.prompt === 'string' && typeof candidate.user_facing_hint === 'string';
  }

  private async dispatchOnError(error: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      if (!plugin.onError) {
        continue;
      }
      try {
        await plugin.onError(error);
      } catch (hookError) {
        log(this.logger, 'warn', 'Plugin onError hook failed', {
          plugin: plugin.name,
          error: hookError instanceof Error ? hookError.message : String(hookError),
        });
      }
    }
  }

  private startEventLoop(): void {
    if (!this.session || this.eventLoop) {
      return;
    }

    const session = this.session;
    this.abortEventLoop = false;

    this.eventLoop = (async () => {
      try {
        while (!this.abortEventLoop) {
          let payload: string | null;
          try {
            payload = await session.nextEvent();
          } catch (error) {
            this.emit('error', error);
            await this.dispatchOnError(error);
            break;
          }

          if (!payload) {
            break;
          }

          let event: CodexEvent;
          try {
            event = JSON.parse(payload) as CodexEvent;
          } catch (error) {
            log(this.logger, 'warn', 'Failed to parse Codex event payload', {
              payload,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          this.emit('event', event);
          await this.dispatchAfterEvent(event);
          this.routeEvent(event);
        }
      } finally {
        this.eventLoop = undefined;
        this.emit(EVENT_STREAM_CLOSED);
      }
    })();
  }

  private routeEvent(event: CodexEvent): void {
    switch (event.msg.type) {
      case 'session_configured':
        this.emit('sessionConfigured', event.msg as SessionConfiguredEventMessage);
        break;
      case 'exec_approval_request':
        this.emit('execCommandApproval', event.msg as ExecApprovalRequestEventMessage);
        break;
      case 'apply_patch_approval_request':
        this.emit('applyPatchApproval', event.msg as ApplyPatchApprovalRequestEventMessage);
        break;
      case 'notification':
        this.emit('notification', event.msg as NotificationEventMessage);
        break;
      case 'conversation_path':
        this.emit('conversationPath', event.msg);
        break;
      case 'shutdown_complete':
        this.emit('shutdownComplete', event.msg);
        break;
      case 'turn_context':
        this.emit('turnContext', event.msg);
        break;
      case 'get_history_entry_response':
        if (this.isGetHistoryEntryResponseEventMessage(event.msg)) {
          this.emit('historyEntry', event.msg);
        }
        break;
      case 'mcp_list_tools_response':
        if (this.isMcpListToolsResponseEventMessage(event.msg)) {
          this.emit('mcpTools', event.msg);
        }
        break;
      case 'list_custom_prompts_response':
        if (this.isListCustomPromptsResponseEventMessage(event.msg)) {
          this.emit('customPrompts', event.msg);
        }
        break;
      case 'entered_review_mode':
        if (this.isEnteredReviewModeEventMessage(event.msg)) {
          this.emit('enteredReviewMode', event.msg);
        }
        break;
      case 'exited_review_mode':
        this.emit('exitedReviewMode', event.msg as ExitedReviewModeEventMessage);
        break;
      default:
        break;
    }
  }

  private async closeSession(): Promise<void> {
    this.abortEventLoop = true;
    const session = this.session;
    const eventLoop = this.eventLoop;

    this.session = undefined;
    this.eventLoop = undefined;

    if (session) {
      try {
        await session.close();
      } catch (error) {
        log(this.logger, 'warn', 'Failed to close Codex session', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (eventLoop) {
      await Promise.race([
        eventLoop.catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } else {
      this.emit(EVENT_STREAM_CLOSED);
    }
  }

  private requireSession(): CodexSessionHandle {
    if (!this.session) {
      throw new CodexSessionError('No active Codex session. Call createConversation first.');
    }
    return this.session;
  }

  private async initializePlugins(): Promise<void> {
    if (this.pluginsInitialized) {
      return;
    }
    for (const plugin of this.plugins) {
      try {
        await plugin.initialize?.({ client: this, logger: this.logger });
      } catch (error) {
        log(this.logger, 'warn', 'Plugin initialization failed', {
          plugin: plugin.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.pluginsInitialized = true;
  }

  private generateRequestId(): string {
    this.requestCounter += 1;
    return `req_${this.requestCounter}_${Date.now()}`;
  }

  private resolveCodexHome(): string | undefined {
    const configured = this.config.codexHome ?? process.env.CODEX_HOME;
    if (!configured) {
      return undefined;
    }
    return expandHomePath(configured);
  }

  private wrapConnectionError(message: string, cause: unknown, codexHome?: string): CodexConnectionError {
    return new CodexConnectionError(message, {
      cause: cause instanceof Error ? cause.message : String(cause),
      codexHome: codexHome ?? this.config.codexHome ?? process.env.CODEX_HOME,
    });
  }

  private wrapSessionError(message: string, cause: unknown, details?: unknown): CodexSessionError {
    return new CodexSessionError(message, {
      cause: errorMessage(cause),
      details,
    });
  }
}

type WorkspaceWriteSandboxPolicy = Extract<SandboxPolicy, { mode: 'workspace-write' }>;

function isAskForApprovalValue(value: unknown): value is AskForApproval {
  return typeof value === 'string' && (APPROVAL_POLICY_VALUES as readonly string[]).includes(value);
}

function isReasoningEffortValue(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORT_VALUES as readonly string[]).includes(value);
}

function isReasoningSummaryValue(value: unknown): value is ReasoningSummary {
  return typeof value === 'string' && (REASONING_SUMMARY_VALUES as readonly string[]).includes(value);
}

function isSandboxPolicyValue(value: unknown): value is SandboxPolicy {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { mode?: unknown };
  if (candidate.mode === 'danger-full-access' || candidate.mode === 'read-only') {
    return true;
  }

  if (candidate.mode === 'workspace-write') {
    const workspacePolicy = value as WorkspaceWriteSandboxPolicy;
    if (
      typeof workspacePolicy.network_access !== 'boolean' ||
      typeof workspacePolicy.exclude_tmpdir_env_var !== 'boolean' ||
      typeof workspacePolicy.exclude_slash_tmp !== 'boolean'
    ) {
      return false;
    }

    if (
      workspacePolicy.writable_roots !== undefined &&
      (!Array.isArray(workspacePolicy.writable_roots) ||
        workspacePolicy.writable_roots.some((entry) => typeof entry !== 'string'))
    ) {
      return false;
    }

    return true;
  }

  return false;
}

type CodexClientEventListener<T> = (event: T) => void;

export interface SessionConfiguredEventMessage extends CodexEventMessage {
  type: 'session_configured';
  session_id: string;
  model: string;
  reasoning_effort?: ReasoningEffort;
  history_log_id: number;
  history_entry_count: number;
  initial_messages?: CodexEventMessage[];
  rollout_path: string;
}

export interface ExecApprovalRequestEventMessage extends CodexEventMessage {
  type: 'exec_approval_request';
  call_id: string;
  command: string[];
  cwd: string;
  reason?: string;
  id?: string;
}

export interface ApplyPatchApprovalRequestEventMessage extends CodexEventMessage {
  type: 'apply_patch_approval_request';
  call_id: string;
  changes: Record<string, FileChange>;
  reason?: string;
  grant_root?: string;
  id?: string;
}

export interface NotificationEventMessage extends CodexEventMessage {
  type: 'notification';
  content?: string;
}

export interface ConversationPathEventMessage extends CodexEventMessage {
  type: 'conversation_path';
  conversation_id: string;
  path: string;
}

export interface ShutdownCompleteEventMessage extends CodexEventMessage {
  type: 'shutdown_complete';
}

export interface TurnContextEventMessage extends CodexEventMessage {
  type: 'turn_context';
  cwd: string;
  approval_policy: AskForApproval;
  sandbox_policy: SandboxPolicy;
  model: string;
  effort?: ReasoningEffort | null;
  summary: ReasoningSummary;
}

export interface HistoryEntryEvent {
  conversation_id: string;
  ts: number;
  text: string;
}

export interface GetHistoryEntryResponseEventMessage extends CodexEventMessage {
  type: 'get_history_entry_response';
  offset: number;
  log_id: number;
  entry?: HistoryEntryEvent;
}

export type McpToolDefinition = Record<string, unknown>;

export interface McpListToolsResponseEventMessage extends CodexEventMessage {
  type: 'mcp_list_tools_response';
  tools: Record<string, McpToolDefinition>;
}

export interface CustomPromptDefinition {
  name: string;
  path: string;
  content: string;
}

export interface ListCustomPromptsResponseEventMessage extends CodexEventMessage {
  type: 'list_custom_prompts_response';
  custom_prompts: CustomPromptDefinition[];
}

export interface ReviewLineRange {
  start: number;
  end: number;
}

export interface ReviewCodeLocation {
  absolute_file_path: string;
  line_range: ReviewLineRange;
}

export interface ReviewFinding {
  title: string;
  body: string;
  confidence_score: number;
  priority: number;
  code_location: ReviewCodeLocation;
}

export interface ReviewOutputEventMessage {
  findings: ReviewFinding[];
  overall_correctness: string;
  overall_explanation: string;
  overall_confidence_score: number;
}

export interface EnteredReviewModeEventMessage extends ReviewRequest, CodexEventMessage {
  type: 'entered_review_mode';
}

export interface ExitedReviewModeEventMessage extends CodexEventMessage {
  type: 'exited_review_mode';
  review_output?: ReviewOutputEventMessage;
}

export interface CodexClient {
  on(event: 'sessionConfigured', listener: CodexClientEventListener<SessionConfiguredEventMessage>): this;
  on(event: 'execCommandApproval', listener: CodexClientEventListener<ExecApprovalRequestEventMessage>): this;
  on(
    event: 'applyPatchApproval',
    listener: CodexClientEventListener<ApplyPatchApprovalRequestEventMessage>,
  ): this;
  on(event: 'notification', listener: CodexClientEventListener<NotificationEventMessage>): this;
  on(event: 'conversationPath', listener: CodexClientEventListener<ConversationPathEventMessage>): this;
  on(event: 'shutdownComplete', listener: CodexClientEventListener<ShutdownCompleteEventMessage>): this;
  on(event: 'turnContext', listener: CodexClientEventListener<TurnContextEventMessage>): this;
  on(event: 'historyEntry', listener: CodexClientEventListener<GetHistoryEntryResponseEventMessage>): this;
  on(event: 'mcpTools', listener: CodexClientEventListener<McpListToolsResponseEventMessage>): this;
  on(event: 'customPrompts', listener: CodexClientEventListener<ListCustomPromptsResponseEventMessage>): this;
  on(event: 'enteredReviewMode', listener: CodexClientEventListener<EnteredReviewModeEventMessage>): this;
  on(event: 'exitedReviewMode', listener: CodexClientEventListener<ExitedReviewModeEventMessage>): this;
  on(event: 'event', listener: CodexClientEventListener<CodexEvent>): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  on(event: typeof EVENT_STREAM_CLOSED, listener: () => void): this;

  once(event: 'sessionConfigured', listener: CodexClientEventListener<SessionConfiguredEventMessage>): this;
  once(event: 'execCommandApproval', listener: CodexClientEventListener<ExecApprovalRequestEventMessage>): this;
  once(
    event: 'applyPatchApproval',
    listener: CodexClientEventListener<ApplyPatchApprovalRequestEventMessage>,
  ): this;
  once(event: 'notification', listener: CodexClientEventListener<NotificationEventMessage>): this;
  once(event: 'conversationPath', listener: CodexClientEventListener<ConversationPathEventMessage>): this;
  once(event: 'shutdownComplete', listener: CodexClientEventListener<ShutdownCompleteEventMessage>): this;
  once(event: 'turnContext', listener: CodexClientEventListener<TurnContextEventMessage>): this;
  once(event: 'historyEntry', listener: CodexClientEventListener<GetHistoryEntryResponseEventMessage>): this;
  once(event: 'mcpTools', listener: CodexClientEventListener<McpListToolsResponseEventMessage>): this;
  once(event: 'customPrompts', listener: CodexClientEventListener<ListCustomPromptsResponseEventMessage>): this;
  once(event: 'enteredReviewMode', listener: CodexClientEventListener<EnteredReviewModeEventMessage>): this;
  once(event: 'exitedReviewMode', listener: CodexClientEventListener<ExitedReviewModeEventMessage>): this;
  once(event: 'event', listener: CodexClientEventListener<CodexEvent>): this;
  once(event: 'error', listener: (error: unknown) => void): this;
  once(event: typeof EVENT_STREAM_CLOSED, listener: () => void): this;

  off(event: 'sessionConfigured', listener: CodexClientEventListener<SessionConfiguredEventMessage>): this;
  off(event: 'execCommandApproval', listener: CodexClientEventListener<ExecApprovalRequestEventMessage>): this;
  off(
    event: 'applyPatchApproval',
    listener: CodexClientEventListener<ApplyPatchApprovalRequestEventMessage>,
  ): this;
  off(event: 'notification', listener: CodexClientEventListener<NotificationEventMessage>): this;
  off(event: 'conversationPath', listener: CodexClientEventListener<ConversationPathEventMessage>): this;
  off(event: 'shutdownComplete', listener: CodexClientEventListener<ShutdownCompleteEventMessage>): this;
  off(event: 'turnContext', listener: CodexClientEventListener<TurnContextEventMessage>): this;
  off(event: 'historyEntry', listener: CodexClientEventListener<GetHistoryEntryResponseEventMessage>): this;
  off(event: 'mcpTools', listener: CodexClientEventListener<McpListToolsResponseEventMessage>): this;
  off(event: 'customPrompts', listener: CodexClientEventListener<ListCustomPromptsResponseEventMessage>): this;
  off(event: 'enteredReviewMode', listener: CodexClientEventListener<EnteredReviewModeEventMessage>): this;
  off(event: 'exitedReviewMode', listener: CodexClientEventListener<ExitedReviewModeEventMessage>): this;
  off(event: 'event', listener: CodexClientEventListener<CodexEvent>): this;
  off(event: 'error', listener: (error: unknown) => void): this;
  off(event: typeof EVENT_STREAM_CLOSED, listener: () => void): this;

  on(event: string, listener: (...args: unknown[]) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}
function expandHomePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (!trimmed.startsWith('~')) {
    return trimmed;
  }

  const home = os.homedir();
  if (!home) {
    return trimmed;
  }

  if (trimmed === '~') {
    return home;
  }

  if (trimmed.startsWith('~/')) {
    return path.join(home, trimmed.slice(2));
  }

  if (trimmed.startsWith('~\\')) {
    return path.join(home, trimmed.slice(2));
  }

  return path.join(home, trimmed.slice(1));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
