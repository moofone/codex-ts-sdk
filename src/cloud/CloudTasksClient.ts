import { toCloudTasksError } from './errors';
import type {
  ApplyOptions,
  ApplyOutcome,
  CreatedTask,
  ListTasksOptions,
  TaskSummary,
  TaskText,
  TurnAttempt,
} from '../types/cloud-tasks';
import { getCloudBindings, toNativeApplyParams, toNativeConfig } from './internal/bindings';
import { toApplyOutcome, toTaskSummary, toTaskText, toTurnAttempt } from './internal/converters';
import type { EnvironmentInfo } from '../types/cloud-tasks';
import { listEnvironmentsFallback, type ResolvedCloudTasksConfig } from './internal/envFallback';

/**
 * Configuration options for CloudTasksClient.
 */
export interface CloudTasksClientOptions {
  /**
   * Base URL of the Codex cloud tasks API.
   * - If omitted, defaults to process.env.CODEX_CLOUD_TASKS_BASE_URL or
   *   'https://chatgpt.com/backend-api' (matching codex-rs 0.45.0+ behavior).
   */
  baseUrl?: string;
  /** Bearer token for API authentication (mutually exclusive with chatGptAccountId) */
  bearerToken?: string;
  /** ChatGPT account ID for authentication (mutually exclusive with bearerToken) */
  chatGptAccountId?: string;
  /** Custom user agent string for API requests */
  userAgent?: string;
  /** Use mock backend for testing (default: false) */
  mock?: boolean;
  /** Optional override for CLI-managed auth location */
  codexHome?: string;
}

/**
 * Client for managing remote Codex cloud tasks.
 *
 * Cloud tasks enable remote code generation where prompts are sent to a cloud backend,
 * executed remotely, and results (diffs, messages) are retrieved and applied locally.
 *
 * @example
 * ```typescript
 * const client = new CloudTasksClient({
 *   // baseUrl optional; defaults to https://chatgpt.com/backend-api
 *   // baseUrl: 'https://chatgpt.com/backend-api',
 *   bearerToken: process.env.OPENAI_API_KEY,
 * });
 *
 * const tasks = await client.listTasks();
 * const created = await client.createTask({
 *   environmentId: 'prod',
 *   prompt: 'Fix the authentication bug',
 *   gitRef: 'main',
 * });
 *
 * client.close();
 * ```
 */
export class CloudTasksClient {
  private readonly native = getCloudBindings();
  private readonly nativeConfig;
  private readonly resolvedConfig: ResolvedCloudTasksConfig;
  private closed = false;

  constructor(private readonly options: CloudTasksClientOptions) {
    const { nativeConfig, resolvedConfig } = this.normalizeConfig(options);
    this.nativeConfig = nativeConfig;
    this.resolvedConfig = resolvedConfig;
  }

  private normalizeConfig(options: CloudTasksClientOptions): {
    nativeConfig: ReturnType<typeof toNativeConfig>;
    resolvedConfig: ResolvedCloudTasksConfig;
  } {
    const resolvedBaseUrl = (options.baseUrl?.trim()) ||
      process.env.CODEX_CLOUD_TASKS_BASE_URL ||
      'https://chatgpt.com/backend-api';

    // Honor env toggle used by codex-rs to enable mock mode, unless explicitly set
    const resolvedMock = typeof options.mock === 'boolean'
      ? options.mock
      : (process.env.CODEX_CLOUD_TASKS_MODE === 'mock' || process.env.CODEX_CLOUD_TASKS_MODE === 'MOCK');

    const resolvedConfig: ResolvedCloudTasksConfig = {
      baseUrl: resolvedBaseUrl,
      bearerToken: options.bearerToken?.trim() || undefined,
      chatGptAccountId: options.chatGptAccountId?.trim() || undefined,
      userAgent: options.userAgent?.trim() || undefined,
      mock: resolvedMock,
      codexHome: options.codexHome?.trim() || process.env.CODEX_HOME || undefined,
    };

    const nativeConfig = toNativeConfig({
      ...options,
      baseUrl: resolvedBaseUrl,
      mock: resolvedMock,
    });

    return { nativeConfig, resolvedConfig };
  }

  /**
   * List all cloud tasks, optionally filtered by environment.
   *
   * @param options - Filtering and pagination options
   * @returns Array of task summaries
   * @throws {CloudTasksError} If the API request fails
   *
   * @example
   * ```typescript
   * // List all tasks
   * const tasks = await client.listTasks();
   *
   * // Filter by environment and limit results
   * const prodTasks = await client.listTasks({
   *   environmentId: 'prod',
   *   limit: 10,
   * });
   * ```
   *
   * @remarks
   * **Caveat (current backend):**
   * Listing by environment is not reliable right now; use the returned task ID to track.
   * `listTasks({ environmentId })` may not filter server-side yet, and the list payload
   * often lacks `environmentId`. Use `getTaskText(id)` or `getTaskMessages(id)` to track
   * specific tasks instead of relying on environment filtering.
   */
  async listTasks(options?: ListTasksOptions): Promise<TaskSummary[]> {
    try {
      const env = options?.environmentId;
      const list = await this.native.list(this.nativeConfig, env);
      // limit/scope can be enforced client-side if needed
      const mapped = list.map(toTaskSummary);
      // Do not override environmentId client-side. If the backend does not
      // include environment_id in the list response, leave it undefined so
      // callers can detect backend filtering behavior accurately.
      const limited = options?.limit ? mapped.slice(0, options.limit) : mapped;
      return limited;
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * List available environments (id + label) using the same method as the Codex TUI.
   * Returns a de-duplicated list with pinned environments first.
   */
  async listEnvironments(): Promise<EnvironmentInfo[]> {
    try {
      const nativeRows = await this.tryListEnvironmentsNative();
      if (nativeRows) {
        return nativeRows;
      }
      const fallback = await listEnvironmentsFallback(this.resolvedConfig);
      return fallback;
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Resolve a human label or hex id to the backend environment id.
   * - If `value` is a 32-hex id, returns it.
   * - Otherwise, searches `listEnvironments()` by case-insensitive label.
   */
  async resolveEnvironmentId(value: string): Promise<string> {
    const hex32 = /^[a-f0-9]{32}$/i;
    if (hex32.test(value)) return value;
    const envs = await this.listEnvironments();
    const lc = value.toLowerCase();
    const match = envs.find(e => (e.label || '').toLowerCase() === lc);
    if (!match) throw new Error(`Environment not found by label: ${value}`);
    return match.id;
  }

  /**
   * Create a new cloud task by submitting a prompt for remote execution.
   *
   * @param options - Task creation parameters
   * @param options.environmentId - Target environment ID (e.g., 'prod', 'staging')
   * @param options.prompt - User prompt describing the task to execute
   * @param options.gitRef - Git branch or ref to base the task on (e.g., 'main')
   * @param options.qaMode - Enable QA mode for enhanced validation (default: false)
   * @param options.bestOfN - Generate N attempts and select the best (default: 1)
   * @returns Created task with assigned ID
   * @throws {CloudTasksError} If validation fails or API request fails
   *
   * @example
   * ```typescript
   * const task = await client.createTask({
   *   environmentId: 'prod',
   *   prompt: 'Add error handling to the API endpoints',
   *   gitRef: 'main',
   *   bestOfN: 3, // Generate 3 attempts
   * });
   * console.log('Task created:', task.id);
   * ```
   */
  async createTask(options: { environmentId: string; prompt: string; gitRef: string; qaMode?: boolean; bestOfN?: number }): Promise<CreatedTask> {
    try {
      const { environmentId, prompt, gitRef, qaMode, bestOfN } = options;
      if (!environmentId || !prompt || !gitRef) {
        throw new Error('environmentId, prompt and gitRef are required');
      }
      // Include both snake_case and camelCase keys for napi object mapping
      const created = await this.native.create(this.nativeConfig, {
        // Provide both camelCase and snake_case to satisfy NAPI struct mapping.
        environmentId,
        environment_id: environmentId,
        prompt,
        gitRef: gitRef,
        git_ref: gitRef,
        qaMode: qaMode,
        qa_mode: qaMode,
        bestOfN: bestOfN,
        best_of_n: bestOfN,
      });
      return created;
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Retrieve the unified diff (patch) generated by a task.
   *
   * @param taskId - Unique task identifier
   * @returns Unified diff string, or null if no diff is available
   * @throws {CloudTasksError} If the task is not found or API request fails
   *
   * @example
   * ```typescript
   * const diff = await client.getTaskDiff('task-123');
   * if (diff) {
   *   console.log('Generated changes:', diff);
   * }
   * ```
   */
  async getTaskDiff(taskId: string): Promise<string | null> {
    try {
      return await this.native.getDiff(this.nativeConfig, taskId);
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Retrieve assistant output messages from a task (without diff content).
   *
   * @param taskId - Unique task identifier
   * @returns Array of assistant messages
   * @throws {CloudTasksError} If the task is not found or API request fails
   *
   * @example
   * ```typescript
   * const messages = await client.getTaskMessages('task-123');
   * messages.forEach(msg => console.log('Assistant:', msg));
   * ```
   */
  async getTaskMessages(taskId: string): Promise<string[]> {
    try {
      return await this.native.getMessages(this.nativeConfig, taskId);
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Retrieve complete task text including prompt, messages, and metadata.
   *
   * This method provides comprehensive task information including the original prompt,
   * assistant messages, turn IDs for best-of-N workflows, and attempt status.
   *
   * @param taskId - Unique task identifier
   * @returns Task text with prompt, messages, and metadata
   * @throws {CloudTasksError} If the task is not found or API request fails
   *
   * @example
   * ```typescript
   * const text = await client.getTaskText('task-123');
   * console.log('Original prompt:', text.prompt);
   * console.log('Attempt:', text.attemptPlacement + 1);
   * console.log('Status:', text.attemptStatus);
   * ```
   */
  async getTaskText(taskId: string): Promise<TaskText> {
    try {
      const n = await this.native.getText(this.nativeConfig, taskId);
      return toTaskText(n);
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Perform a dry-run application of a task's diff to validate it applies cleanly.
   *
   * This method never modifies the working tree. It validates whether the patch
   * would apply successfully and reports any conflicts or skipped files.
   *
   * @param taskId - Unique task identifier
   * @param options - Apply options (diffOverride to test alternate attempts)
   * @returns Outcome with status, message, and lists of conflicts/skipped files
   * @throws {CloudTasksError} If the task is not found or API request fails
   *
   * @example
   * ```typescript
   * const preflight = await client.applyTaskPreflight('task-123');
   * if (preflight.status === 'success') {
   *   console.log('Patch will apply cleanly');
   * } else {
   *   console.warn('Conflicts:', preflight.conflictPaths);
   * }
   * ```
   */
  async applyTaskPreflight(taskId: string, options?: ApplyOptions): Promise<ApplyOutcome> {
    try {
      const { diffOverride, preflight } = toNativeApplyParams(taskId, { ...options, dryRun: true });
      const outcome = await this.native.apply(this.nativeConfig, taskId, diffOverride, preflight);
      return toApplyOutcome(outcome);
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Apply a task's diff to the local working tree.
   *
   * This method modifies local files by applying the generated patch. Always run
   * `applyTaskPreflight()` first to check for conflicts.
   *
   * @param taskId - Unique task identifier
   * @param options - Apply options (diffOverride to apply alternate attempts)
   * @returns Outcome with status, message, and lists of conflicts/skipped files
   * @throws {CloudTasksError} If the task is not found or API request fails
   *
   * @example
   * ```typescript
   * // Check first
   * const preflight = await client.applyTaskPreflight('task-123');
   * if (preflight.status === 'success') {
   *   // Apply for real
   *   const result = await client.applyTask('task-123');
   *   console.log(result.message);
   * }
   * ```
   */
  async applyTask(taskId: string, options?: ApplyOptions): Promise<ApplyOutcome> {
    try {
      const { diffOverride, preflight } = toNativeApplyParams(taskId, options);
      const outcome = await this.native.apply(this.nativeConfig, taskId, diffOverride, preflight);
      return toApplyOutcome(outcome);
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * List all sibling attempts for a task (best-of-N feature).
   *
   * When a task is created with `bestOfN > 1`, multiple attempts are generated.
   * This method retrieves all attempts for review and comparison.
   *
   * @param taskId - Unique task identifier
   * @param turnId - Turn ID from the task text (identifies the generation attempt)
   * @returns Array of turn attempts with diffs and messages
   * @throws {CloudTasksError} If the task is not found or API request fails
   *
   * @example
   * ```typescript
   * const text = await client.getTaskText('task-123');
   * if (text.turnId) {
   *   const attempts = await client.listSiblingAttempts('task-123', text.turnId);
   *   console.log(`Found ${attempts.length} attempts`);
   *   attempts.forEach((a, i) => {
   *     console.log(`Attempt ${i + 1}:`, a.status);
   *   });
   * }
   * ```
   */
  async listSiblingAttempts(taskId: string, turnId: string): Promise<TurnAttempt[]> {
    try {
      const list = await this.native.listAttempts(this.nativeConfig, taskId, turnId);
      return list.map(toTurnAttempt);
    } catch (err) {
      throw toCloudTasksError(err);
    }
  }

  /**
   * Close the client and release resources.
   *
   * This method is idempotent and safe to call multiple times.
   *
   * @example
   * ```typescript
   * const client = new CloudTasksClient({ ... });
   * try {
   *   await client.listTasks();
   * } finally {
   *   client.close();
   * }
   * ```
   */
  close(): void {
    if (!this.closed) {
      this.native?.close?.();
      this.closed = true;
    }
  }

  private async tryListEnvironmentsNative(): Promise<EnvironmentInfo[] | undefined> {
    if (typeof this.native.listEnvironments !== 'function') {
      return undefined;
    }
    try {
      const rows = await this.native.listEnvironments(this.nativeConfig);
      return rows.map(r => ({
        id: r.id,
        label: r.label,
        isPinned: r.isPinned ?? (r as { is_pinned?: boolean }).is_pinned,
        repoHints: r.repoHints ?? (r as { repo_hints?: string }).repo_hints,
      }));
    } catch (err) {
      if (this.isUnimplementedError(err)) {
        return undefined;
      }
      throw err;
    }
  }

  private isUnimplementedError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return message.includes('UNIMPLEMENTED') || message.includes('not available') || message.includes('unsupported');
  }
}
