import type { InputItem } from '../bindings/InputItem';
import type { AskForApproval } from '../bindings/AskForApproval';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { ReasoningEffort } from '../bindings/ReasoningEffort';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { ReviewDecision } from '../bindings/ReviewDecision';
import type { OverrideTurnContextOptions } from '../types/options';

export interface SubmissionEnvelope<T extends SubmissionOp = SubmissionOp> {
  id: string;
  op: T;
}

export type SubmissionOp =
  | UserInputOp
  | UserTurnOp
  | InterruptOp
  | OverrideTurnContextOp
  | ExecApprovalOp
  | PatchApprovalOp
  | AddToHistoryOp
  | GetHistoryEntryRequestOp
  | GetPathOp
  | ListMcpToolsOp
  | ListCustomPromptsOp
  | CompactOp
  | ReviewOp
  | ShutdownOp
  | StatusOp;

export interface UserInputOp {
  type: 'user_input';
  items: InputItem[];
}

export interface UserTurnOp {
  type: 'user_turn';
  items: InputItem[];
  cwd: string;
  approval_policy: AskForApproval;
  sandbox_policy: SandboxPolicy;
  model: string;
  effort?: ReasoningEffort;
  summary: ReasoningSummary;
}

export interface InterruptOp {
  type: 'interrupt';
}

export interface OverrideTurnContextOp {
  type: 'override_turn_context';
  cwd?: string;
  approval_policy?: AskForApproval;
  sandbox_policy?: SandboxPolicy;
  model?: string;
  effort?: ReasoningEffort | null;
  summary?: ReasoningSummary;
}

export interface ExecApprovalOp {
  type: 'exec_approval';
  id: string;
  decision: ReviewDecision;
}

export interface PatchApprovalOp {
  type: 'patch_approval';
  id: string;
  decision: ReviewDecision;
}

export interface AddToHistoryOp {
  type: 'add_to_history';
  text: string;
}

export interface GetHistoryEntryRequestOp {
  type: 'get_history_entry_request';
  offset: number;
  log_id: number;
}

export interface GetPathOp {
  type: 'get_path';
}

export interface ListMcpToolsOp {
  type: 'list_mcp_tools';
}

export interface ListCustomPromptsOp {
  type: 'list_custom_prompts';
}

export interface CompactOp {
  type: 'compact';
}

export interface ReviewRequest {
  prompt: string;
  user_facing_hint: string;
}

export interface ReviewOp {
  type: 'review';
  review_request: ReviewRequest;
}

export interface ShutdownOp {
  type: 'shutdown';
}

export interface StatusOp {
  type: 'status';
}

export interface CreateUserTurnSubmissionOptions {
  items: InputItem[];
  cwd: string;
  approvalPolicy: AskForApproval;
  sandboxPolicy: SandboxPolicy;
  model: string;
  effort?: ReasoningEffort;
  summary: ReasoningSummary;
}

export interface ApprovalSubmissionOptions {
  id: string;
  decision: 'approve' | 'reject';
  kind?: 'exec' | 'patch';
}

export type CreateOverrideTurnContextSubmissionOptions = OverrideTurnContextOptions;

export interface CreateAddToHistorySubmissionOptions {
  text: string;
}

export interface CreateGetHistoryEntryRequestSubmissionOptions {
  offset: number;
  logId: number;
}

export interface CreateReviewSubmissionOptions {
  reviewRequest: ReviewRequest;
}

export function createUserInputSubmission(id: string, items: InputItem[]): SubmissionEnvelope<UserInputOp> {
  return {
    id,
    op: {
      type: 'user_input',
      items,
    },
  };
}

export function createUserTurnSubmission(
  id: string,
  options: CreateUserTurnSubmissionOptions,
): SubmissionEnvelope<UserTurnOp> {
  const op: UserTurnOp = {
    type: 'user_turn',
    items: options.items,
    cwd: options.cwd,
    approval_policy: options.approvalPolicy,
    sandbox_policy: options.sandboxPolicy,
    model: options.model,
    summary: options.summary,
  };

  if (options.effort) {
    op.effort = options.effort;
  }

  return { id, op };
}

export function createInterruptSubmission(id: string): SubmissionEnvelope<InterruptOp> {
  return {
    id,
    op: {
      type: 'interrupt',
    },
  };
}

export function createOverrideTurnContextSubmission(
  id: string,
  options: CreateOverrideTurnContextSubmissionOptions,
): SubmissionEnvelope<OverrideTurnContextOp> {
  const op: OverrideTurnContextOp = {
    type: 'override_turn_context',
  };

  if (options.cwd !== undefined) {
    op.cwd = options.cwd;
  }

  if (options.approvalPolicy !== undefined) {
    op.approval_policy = options.approvalPolicy;
  }

  if (options.sandboxPolicy !== undefined) {
    op.sandbox_policy = options.sandboxPolicy;
  }

  if (options.model !== undefined) {
    op.model = options.model;
  }

  if (options.effort !== undefined) {
    op.effort = options.effort;
  }

  if (options.summary !== undefined) {
    op.summary = options.summary;
  }

  return { id, op };
}

export function createExecApprovalSubmission(
  id: string,
  options: ApprovalSubmissionOptions,
): SubmissionEnvelope<ExecApprovalOp> {
  const decision: ReviewDecision = options.decision === 'approve' ? 'approved' : 'denied';

  return {
    id,
    op: {
      type: 'exec_approval',
      id: options.id,
      decision,
    },
  };
}

export function createPatchApprovalSubmission(
  id: string,
  options: ApprovalSubmissionOptions & { kind: 'exec' },
): SubmissionEnvelope<ExecApprovalOp>;
export function createPatchApprovalSubmission(
  id: string,
  options: ApprovalSubmissionOptions & { kind?: 'patch' },
): SubmissionEnvelope<PatchApprovalOp>;
export function createPatchApprovalSubmission(
  id: string,
  options: ApprovalSubmissionOptions,
): SubmissionEnvelope<ExecApprovalOp | PatchApprovalOp> {
  const decision: ReviewDecision = options.decision === 'approve' ? 'approved' : 'denied';

  if (options.kind === 'exec') {
    return {
      id,
      op: {
        type: 'exec_approval',
        id: options.id,
        decision,
      },
    };
  }

  return {
    id,
    op: {
      type: 'patch_approval',
      id: options.id,
      decision,
    },
  };
}

export function createAddToHistorySubmission(
  id: string,
  options: CreateAddToHistorySubmissionOptions,
): SubmissionEnvelope<AddToHistoryOp> {
  return {
    id,
    op: {
      type: 'add_to_history',
      text: options.text,
    },
  };
}

export function createGetHistoryEntryRequestSubmission(
  id: string,
  options: CreateGetHistoryEntryRequestSubmissionOptions,
): SubmissionEnvelope<GetHistoryEntryRequestOp> {
  return {
    id,
    op: {
      type: 'get_history_entry_request',
      offset: options.offset,
      log_id: options.logId,
    },
  };
}

export function createGetPathSubmission(id: string): SubmissionEnvelope<GetPathOp> {
  return {
    id,
    op: {
      type: 'get_path',
    },
  };
}


export function createListMcpToolsSubmission(id: string): SubmissionEnvelope<ListMcpToolsOp> {
  return {
    id,
    op: {
      type: 'list_mcp_tools',
    },
  };
}

export function createListCustomPromptsSubmission(id: string): SubmissionEnvelope<ListCustomPromptsOp> {
  return {
    id,
    op: {
      type: 'list_custom_prompts',
    },
  };
}

export function createCompactSubmission(id: string): SubmissionEnvelope<CompactOp> {
  return {
    id,
    op: {
      type: 'compact',
    },
  };
}

export function createReviewSubmission(
  id: string,
  options: CreateReviewSubmissionOptions,
): SubmissionEnvelope<ReviewOp> {
  return {
    id,
    op: {
      type: 'review',
      review_request: options.reviewRequest,
    },
  };
}

export function createShutdownSubmission(id: string): SubmissionEnvelope<ShutdownOp> {
  return {
    id,
    op: {
      type: 'shutdown',
    },
  };
}

export function createStatusSubmission(id: string): SubmissionEnvelope<StatusOp> {
  return {
    id,
    op: {
      type: 'status',
    },
  };
}
