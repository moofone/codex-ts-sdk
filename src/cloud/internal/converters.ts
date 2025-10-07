import type {
  ApplyOutcome,
  AttemptStatus,
  TaskSummary,
  TurnAttempt,
  TaskText,
} from '../../types/cloud-tasks';

// N-API object shapes (as plain TS interfaces for conversions)
// NOTE: NAPI-RS automatically converts snake_case to camelCase
export interface DiffSummaryNapi {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface PullRequestNapi {
  number?: number;
  url?: string;
  state?: string;
  merged?: boolean;
  title?: string;
  body?: string;
  baseBranch?: string;
  headBranch?: string;
  baseSha?: string;
  headSha?: string;
  mergeCommitSha?: string;
}

export interface TaskSummaryNapi {
  // Allow both camelCase (NAPI-RS default) and snake_case (HTTP JSON)
  id: string;
  title: string;
  status: string;
  updatedAt?: string; // ISO 8601
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
  hasGeneratedTitle?: boolean;
  has_generated_title?: boolean;
  environmentId?: string;
  environment_id?: string;
  environmentLabel?: string;
  environment_label?: string;
  summary: DiffSummaryNapi & { files_changed?: number; lines_added?: number; lines_removed?: number };
  isReview?: boolean;
  is_review?: boolean;
  attemptTotal?: number;
  attempt_total?: number;
  archived?: boolean;
  hasUnreadTurn?: boolean;
  has_unread_turn?: boolean;
  branchName?: string;
  branch_name?: string;
  turnId?: string;
  turn_id?: string;
  turnStatus?: string;
  turn_status?: string;
  siblingTurnIds?: string[];
  sibling_turn_ids?: string[];
  intent?: string;
  initialIntent?: string;
  initial_intent?: string;
  fixTaskId?: string;
  fix_task_id?: string;
  pullRequests?: PullRequestNapi[];
}

export interface ApplyOutcomeNapi {
  applied: boolean;
  status: string;
  message: string;
  skippedPaths?: string[];
  skipped_paths?: string[];
  conflictPaths?: string[];
  conflict_paths?: string[];
}

export interface TurnAttemptNapi {
  turnId?: string;
  turn_id?: string;
  attemptPlacement?: number;
  attempt_placement?: number;
  createdAt?: string; // ISO
  created_at?: string;
  status: string;
  diff?: string;
  messages?: string[];
}

export interface TaskTextNapi {
  prompt?: string;
  messages?: string[];
  turnId?: string;
  turn_id?: string;
  siblingTurnIds?: string[];
  sibling_turn_ids?: string[];
  attemptPlacement?: number;
  attempt_placement?: number;
  attemptStatus?: string;
  attempt_status?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pick<T>(o: unknown, camel: string, snake?: string): T | undefined {
  if (!isObject(o)) return undefined;
  if (camel in o) return o[camel] as T;
  if (snake && snake in o) return o[snake] as T;
  return undefined;
}

export function toAttemptStatus(value: string | undefined): AttemptStatus {
  switch (value) {
    case 'pending':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return value;
    case 'in_progress':
    case 'in-progress':
      return 'in-progress';
    default:
      return 'unknown';
  }
}

export function toTaskSummary(n: TaskSummaryNapi): TaskSummary {
  const updatedAt = pick<string>(n, 'updatedAt', 'updated_at');
  const createdAt = pick<string>(n, 'createdAt', 'created_at');
  const hasGeneratedTitle = pick<boolean>(n, 'hasGeneratedTitle', 'has_generated_title');
  const environmentId = pick<string>(n, 'environmentId', 'environment_id');
  const environmentLabel = pick<string>(n, 'environmentLabel', 'environment_label');
  const isReview = pick<boolean>(n, 'isReview', 'is_review') ?? false;
  const attemptTotal = pick<number>(n, 'attemptTotal', 'attempt_total');
  const hasUnreadTurn = pick<boolean>(n, 'hasUnreadTurn', 'has_unread_turn');
  const branchName = pick<string>(n, 'branchName', 'branch_name');
  const turnId = pick<string>(n, 'turnId', 'turn_id');
  const turnStatus = pick<string>(n, 'turnStatus', 'turn_status');
  const siblingTurnIds = pick<string[]>(n, 'siblingTurnIds', 'sibling_turn_ids');
  const initialIntent = pick<string>(n, 'initialIntent', 'initial_intent');
  const fixTaskId = pick<string>(n, 'fixTaskId', 'fix_task_id');

  const filesChanged = pick<number>(n.summary, 'filesChanged', 'files_changed') ?? 0;
  const linesAdded = pick<number>(n.summary, 'linesAdded', 'lines_added') ?? 0;
  const linesRemoved = pick<number>(n.summary, 'linesRemoved', 'lines_removed') ?? 0;

  return {
    id: n.id,
    title: n.title,
    status: n.status as TaskSummary['status'],
    updatedAt: updatedAt ? new Date(updatedAt) : new Date(NaN),
    createdAt: createdAt ? new Date(createdAt) : undefined,
    hasGeneratedTitle,
    environmentId,
    environmentLabel,
    summary: { filesChanged, linesAdded, linesRemoved },
    isReview,
    attemptTotal,
    archived: n.archived,
    hasUnreadTurn,
    branchName,
    turnId,
    turnStatus,
    siblingTurnIds,
    intent: n.intent,
    initialIntent,
    fixTaskId,
    pullRequests: n.pullRequests?.map((pr) => ({
      number: pr.number,
      url: pr.url,
      state: pr.state,
      merged: pr.merged,
      title: pr.title,
      body: pr.body,
      baseBranch: pick<string>(pr, 'baseBranch', 'base_branch'),
      headBranch: pick<string>(pr, 'headBranch', 'head_branch'),
      baseSha: pick<string>(pr, 'baseSha', 'base_sha'),
      headSha: pick<string>(pr, 'headSha', 'head_sha'),
      mergeCommitSha: pick<string>(pr, 'mergeCommitSha', 'merge_commit_sha'),
    })),
  };
}

export function toApplyOutcome(n: ApplyOutcomeNapi): ApplyOutcome {
  const skipped = (n.skippedPaths ?? n.skipped_paths) ?? [];
  const conflicts = (n.conflictPaths ?? n.conflict_paths) ?? [];
  return {
    applied: n.applied,
    status: (n.status === 'success' || n.status === 'partial' ? n.status : 'error'),
    message: n.message,
    skippedPaths: skipped,
    conflictPaths: conflicts,
  };
}

export function toTurnAttempt(n: TurnAttemptNapi): TurnAttempt {
  const turnId = pick<string>(n, 'turnId', 'turn_id')!;
  const attemptPlacement = pick<number>(n, 'attemptPlacement', 'attempt_placement');
  const created = pick<string>(n, 'createdAt', 'created_at');
  const messages = pick<string[]>(n, 'messages') ?? [];
  return {
    turnId,
    attemptPlacement,
    createdAt: created ? new Date(created) : undefined,
    status: toAttemptStatus(n.status),
    diff: n.diff,
    messages,
  };
}

export function toTaskText(n: TaskTextNapi): TaskText {
  const messages = pick<string[]>(n, 'messages') ?? [];
  const turnId = pick<string>(n, 'turnId', 'turn_id');
  const siblingTurnIds = pick<string[]>(n, 'siblingTurnIds', 'sibling_turn_ids') ?? [];
  const attemptPlacement = pick<number>(n, 'attemptPlacement', 'attempt_placement');
  const attemptStatus = toAttemptStatus(pick<string>(n, 'attemptStatus', 'attempt_status'));
  return {
    prompt: n.prompt,
    messages,
    turnId,
    siblingTurnIds,
    attemptPlacement,
    attemptStatus,
  };
}
