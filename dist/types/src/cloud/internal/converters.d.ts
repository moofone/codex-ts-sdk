import type { ApplyOutcome, AttemptStatus, TaskSummary, TurnAttempt, TaskText } from '../../types/cloud-tasks';
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
    id: string;
    title: string;
    status: string;
    updatedAt?: string;
    updated_at?: string;
    createdAt?: string;
    created_at?: string;
    hasGeneratedTitle?: boolean;
    has_generated_title?: boolean;
    environmentId?: string;
    environment_id?: string;
    environmentLabel?: string;
    environment_label?: string;
    summary: DiffSummaryNapi & {
        files_changed?: number;
        lines_added?: number;
        lines_removed?: number;
    };
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
    createdAt?: string;
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
export declare function toAttemptStatus(value: string | undefined): AttemptStatus;
export declare function toTaskSummary(n: TaskSummaryNapi): TaskSummary;
export declare function toApplyOutcome(n: ApplyOutcomeNapi): ApplyOutcome;
export declare function toTurnAttempt(n: TurnAttemptNapi): TurnAttempt;
export declare function toTaskText(n: TaskTextNapi): TaskText;
