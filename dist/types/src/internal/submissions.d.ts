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
export type SubmissionOp = UserInputOp | UserTurnOp | InterruptOp | OverrideTurnContextOp | ExecApprovalOp | PatchApprovalOp | AddToHistoryOp | GetHistoryEntryRequestOp | GetPathOp | ListMcpToolsOp | ListCustomPromptsOp | CompactOp | ReviewOp | ShutdownOp | StatusOp;
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
export declare function createUserInputSubmission(id: string, items: InputItem[]): SubmissionEnvelope<UserInputOp>;
export declare function createUserTurnSubmission(id: string, options: CreateUserTurnSubmissionOptions): SubmissionEnvelope<UserTurnOp>;
export declare function createInterruptSubmission(id: string): SubmissionEnvelope<InterruptOp>;
export declare function createOverrideTurnContextSubmission(id: string, options: CreateOverrideTurnContextSubmissionOptions): SubmissionEnvelope<OverrideTurnContextOp>;
export declare function createExecApprovalSubmission(id: string, options: ApprovalSubmissionOptions): SubmissionEnvelope<ExecApprovalOp>;
export declare function createPatchApprovalSubmission(id: string, options: ApprovalSubmissionOptions & {
    kind: 'exec';
}): SubmissionEnvelope<ExecApprovalOp>;
export declare function createPatchApprovalSubmission(id: string, options: ApprovalSubmissionOptions & {
    kind?: 'patch';
}): SubmissionEnvelope<PatchApprovalOp>;
export declare function createAddToHistorySubmission(id: string, options: CreateAddToHistorySubmissionOptions): SubmissionEnvelope<AddToHistoryOp>;
export declare function createGetHistoryEntryRequestSubmission(id: string, options: CreateGetHistoryEntryRequestSubmissionOptions): SubmissionEnvelope<GetHistoryEntryRequestOp>;
export declare function createGetPathSubmission(id: string): SubmissionEnvelope<GetPathOp>;
export declare function createListMcpToolsSubmission(id: string): SubmissionEnvelope<ListMcpToolsOp>;
export declare function createListCustomPromptsSubmission(id: string): SubmissionEnvelope<ListCustomPromptsOp>;
export declare function createCompactSubmission(id: string): SubmissionEnvelope<CompactOp>;
export declare function createReviewSubmission(id: string, options: CreateReviewSubmissionOptions): SubmissionEnvelope<ReviewOp>;
export declare function createShutdownSubmission(id: string): SubmissionEnvelope<ShutdownOp>;
export declare function createStatusSubmission(id: string): SubmissionEnvelope<StatusOp>;
