import { CloudTasksError, CloudTasksErrorCode } from '../errors';
import type { ApplyOptions, CreatedTask } from '../../types/cloud-tasks';
import type {
  ApplyOutcomeNapi,
  TaskSummaryNapi,
  TaskTextNapi,
  TurnAttemptNapi,
} from './converters';

export interface EnvironmentRowNapi {
  id: string;
  label?: string;
  isPinned?: boolean;
  repoHints?: string;
}

export interface CloudTasksConfig {
  base_url: string;
  bearer_token?: string;
  chatgpt_account_id?: string;
  user_agent?: string;
  mock?: boolean;
  codex_home?: string;
}

export interface CloudBindings {
  list(config: CloudTasksConfig, environmentId?: string): Promise<TaskSummaryNapi[]>;
  listEnvironments(config: CloudTasksConfig): Promise<EnvironmentRowNapi[]>;
  create(config: CloudTasksConfig, options: {
    environmentId: string;
    environment_id?: string;
    prompt: string;
    gitRef: string;
    git_ref?: string;
    qaMode?: boolean;
    qa_mode?: boolean;
    bestOfN?: number;
    best_of_n?: number;
  }): Promise<CreatedTask>;
  getDiff(config: CloudTasksConfig, taskId: string): Promise<string | null>;
  getMessages(config: CloudTasksConfig, taskId: string): Promise<string[]>;
  getText(config: CloudTasksConfig, taskId: string): Promise<TaskTextNapi>;
  apply(config: CloudTasksConfig, taskId: string, diffOverride?: string, preflight?: boolean): Promise<ApplyOutcomeNapi>;
  listAttempts(config: CloudTasksConfig, taskId: string, turnId: string): Promise<TurnAttemptNapi[]>;
  close?(): void;
}

function unimplemented<T = never>(): Promise<T> {
  return Promise.reject(
    new CloudTasksError(
      'Cloud tasks are not available in the current native binding. Upgrade codex-rs to rust-v0.45.0+ and rebuild.',
      CloudTasksErrorCode.UNIMPLEMENTED,
    ),
  );
}

export function getCloudBindings(): CloudBindings {
  const native = tryLoadNativeCloudModule();
  // Temporary diagnostic to confirm exported keys
  if (!native) {
    // Default implementation: throw UNIMPLEMENTED. Tests will mock this module.
    return {
      list: () => unimplemented(),
      listEnvironments: () => unimplemented(),
      create: () => unimplemented(),
      getDiff: () => unimplemented(),
      getMessages: () => unimplemented(),
      getText: () => unimplemented(),
      apply: () => unimplemented(),
      listAttempts: () => unimplemented(),
      close: () => {},
    };
  }

  const pick = <T>(camel: string, snake: string): T | undefined => {
    const obj: Record<string, unknown> = native;
    const candidate = (obj?.[camel] ?? obj?.[snake]);
    return typeof candidate === 'function' ? (candidate as unknown as T) : undefined;
  };

  const cloudTasksList = pick<(
    config: CloudTasksConfig,
    environmentId?: string
  ) => Promise<TaskSummaryNapi[]>>('cloudTasksList', 'cloud_tasks_list');
  const cloudTasksListEnvironments = pick<(
    config: CloudTasksConfig
  ) => Promise<EnvironmentRowNapi[]>>('cloudTasksListEnvironments', 'cloud_tasks_list_environments');
  const cloudTasksCreate = pick<(
    config: CloudTasksConfig,
    options: {
      environmentId: string;
      environment_id?: string;
      prompt: string;
      gitRef: string;
      git_ref?: string;
      qaMode?: boolean;
      qa_mode?: boolean;
      bestOfN?: number;
      best_of_n?: number;
    }
  ) => Promise<string>>('cloudTasksCreate', 'cloud_tasks_create');
  const cloudTasksGetDiff = pick<(
    config: CloudTasksConfig,
    taskId: string
  ) => Promise<string | null>>('cloudTasksGetDiff', 'cloud_tasks_get_diff');
  const cloudTasksGetMessages = pick<(
    config: CloudTasksConfig,
    taskId: string
  ) => Promise<string[]>>('cloudTasksGetMessages', 'cloud_tasks_get_messages');
  const cloudTasksGetText = pick<(
    config: CloudTasksConfig,
    taskId: string
  ) => Promise<TaskTextNapi>>('cloudTasksGetText', 'cloud_tasks_get_text');
  const cloudTasksApply = pick<(
    config: CloudTasksConfig,
    taskId: string,
    diffOverride?: string,
    preflight?: boolean
  ) => Promise<ApplyOutcomeNapi>>('cloudTasksApply', 'cloud_tasks_apply');
  const cloudTasksListAttempts = pick<(
    config: CloudTasksConfig,
    taskId: string,
    turnId: string
  ) => Promise<TurnAttemptNapi[]>>('cloudTasksListAttempts', 'cloud_tasks_list_attempts');

  if (!cloudTasksList) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };
  if (!cloudTasksCreate) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };
  if (!cloudTasksGetDiff) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };
  if (!cloudTasksGetMessages) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };
  if (!cloudTasksGetText) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };
  if (!cloudTasksApply) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };
  if (!cloudTasksListAttempts) return { list: () => unimplemented(), listEnvironments: () => unimplemented(), create: () => unimplemented(), getDiff: () => unimplemented(), getMessages: () => unimplemented(), getText: () => unimplemented(), apply: () => unimplemented(), listAttempts: () => unimplemented(), close: () => {} };

  return {
    async list(config, environmentId) {
      return await cloudTasksList(config, environmentId);
    },
    async listEnvironments(config) {
      if (cloudTasksListEnvironments) {
        return await cloudTasksListEnvironments(config);
      }
      return unimplemented<EnvironmentRowNapi[]>();
    },
    async create(config, options) {
      // Native returns string id
      const id = await cloudTasksCreate(config, options);
      return { id };
    },
    async getDiff(config, taskId) {
      return await cloudTasksGetDiff(config, taskId);
    },
    async getMessages(config, taskId) {
      return await cloudTasksGetMessages(config, taskId);
    },
    async getText(config, taskId) {
      return await cloudTasksGetText(config, taskId);
    },
    async apply(config, taskId, diffOverride, preflight) {
      return await cloudTasksApply(config, taskId, diffOverride, !!preflight);
    },
    async listAttempts(config, taskId, turnId) {
      return await cloudTasksListAttempts(config, taskId, turnId);
    },
    close: () => {},
  };
}

export interface EnvironmentRowNapi {
  id: string;
  label?: string;
  is_pinned?: boolean;
  repo_hints?: string;
}

// Lightweight native loader — mirrors the layout used by internal/nativeModule.ts
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

const requireFromCwd = createRequire(path.join(process.cwd(), 'package.json'));

function resolveProjectRoot(): string {
  let currentDir = process.cwd();
  const visited = new Set<string>();
  while (!visited.has(currentDir)) {
    visited.add(currentDir);
    const pkg = path.join(currentDir, 'package.json');
    const nativeDir = path.join(currentDir, 'native', 'codex-napi');
    if (fs.existsSync(pkg) && fs.existsSync(nativeDir)) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  const cwdNative = path.join(process.cwd(), 'native', 'codex-napi');
  if (fs.existsSync(cwdNative)) {
    return process.cwd();
  }
  return path.resolve(currentDir, '..');
}

function tryLoadNativeCloudModule(): Record<string, unknown> | undefined {
  if (process.env.CODEX_SKIP_NATIVE === '1') {
    return undefined;
  }
  try {
    const projectRoot = resolveProjectRoot();
    const nativeRoot = path.join(projectRoot, 'native', 'codex-napi');
    const candidates = [
      path.join(nativeRoot, 'index.js'),
      path.join(nativeRoot, 'index.node'),
      path.join(nativeRoot, 'prebuilt', `${process.platform}-${process.arch}`, 'index.js'),
      path.join(nativeRoot, 'prebuilt', `${process.platform}-${process.arch}`, 'index.node'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          return requireFromCwd(file) as Record<string, unknown>;
        } catch {
          // try next candidate
        }
      }
    }
  } catch {
    // Ignore
  }
  return undefined;
}

export function toNativeConfig(options: {
  baseUrl: string;
  bearerToken?: string;
  chatGptAccountId?: string;
  userAgent?: string;
  mock?: boolean;
  codexHome?: string;
}): CloudTasksConfig {
  // Include both snake_case and camelCase keys to satisfy napi object mapping
  // which may expect camelCase properties (e.g., baseUrl) for #[napi(object)].
  const cfg: Record<string, unknown> = {
    base_url: options.baseUrl,
    baseUrl: options.baseUrl,
    bearer_token: options.bearerToken,
    bearerToken: options.bearerToken,
    chatgpt_account_id: options.chatGptAccountId,
    chatGptAccountId: options.chatGptAccountId,
    user_agent: options.userAgent,
    userAgent: options.userAgent,
    mock: options.mock,
    codex_home: options.codexHome || process.env.CODEX_HOME,
    codexHome: options.codexHome || process.env.CODEX_HOME,
  };
  return cfg as unknown as CloudTasksConfig;
}

export function toNativeApplyParams(taskId: string, options?: ApplyOptions): { taskId: string; diffOverride?: string; preflight: boolean } {
  return {
    taskId,
    diffOverride: options?.diffOverride,
    preflight: options?.dryRun === true,
  };
}
