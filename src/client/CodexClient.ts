import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import type { InputItem } from '../bindings/InputItem';
import type { AskForApproval } from '../bindings/AskForApproval';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { CodexEvent } from '../types/events';
import type {
  CodexClientConfig,
  CreateConversationOptions,
  SendMessageOptions,
  SendUserTurnOptions,
} from '../types/options';
import type { SubmissionEnvelope } from '../internal/submissions';
import {
  createInterruptSubmission,
  createPatchApprovalSubmission,
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
    const submission = createPatchApprovalSubmission(this.generateRequestId(), {
      id: requestId,
      decision,
      kind: 'exec',
    });
    await this.submit(session, submission);
  }

  async respondToPatchApproval(requestId: string, decision: 'approve' | 'reject'): Promise<void> {
    const session = this.requireSession();
    const submission = createPatchApprovalSubmission(this.generateRequestId(), {
      id: requestId,
      decision,
      kind: 'patch',
    });
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
        this.emit('sessionConfigured', event.msg);
        break;
      case 'exec_approval_request':
        this.emit('execCommandApproval', event.msg);
        break;
      case 'apply_patch_approval_request':
        this.emit('applyPatchApproval', event.msg);
        break;
      case 'notification':
        this.emit('notification', event.msg);
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
