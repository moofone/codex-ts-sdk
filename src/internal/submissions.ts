import type { InputItem } from '../bindings/InputItem';
import type { AskForApproval } from '../bindings/AskForApproval';
import type { SandboxPolicy } from '../bindings/SandboxPolicy';
import type { ReasoningEffort } from '../bindings/ReasoningEffort';
import type { ReasoningSummary } from '../bindings/ReasoningSummary';
import type { ReviewDecision } from '../bindings/ReviewDecision';

export interface SubmissionEnvelope<T extends SubmissionOp = SubmissionOp> {
  id: string;
  op: T;
}

export type SubmissionOp =
  | UserInputOp
  | UserTurnOp
  | InterruptOp
  | ExecApprovalOp
  | PatchApprovalOp;

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
  kind: 'exec' | 'patch';
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
