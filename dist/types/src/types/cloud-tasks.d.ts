export interface DiffSummary {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
}
export type TaskStatus = 'pending' | 'ready' | 'applied' | 'error';
export interface PullRequest {
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
export interface TaskSummary {
    id: string;
    title: string;
    status: TaskStatus;
    updatedAt: Date;
    createdAt?: Date;
    hasGeneratedTitle?: boolean;
    environmentId?: string;
    environmentLabel?: string;
    summary: DiffSummary;
    isReview: boolean;
    attemptTotal?: number;
    archived?: boolean;
    hasUnreadTurn?: boolean;
    branchName?: string;
    turnId?: string;
    turnStatus?: string;
    siblingTurnIds?: string[];
    intent?: string;
    initialIntent?: string;
    fixTaskId?: string;
    pullRequests?: PullRequest[];
}
export interface CreateTaskOptions {
    environmentId: string;
    prompt: string;
    gitRef: string;
    qaMode?: boolean;
    bestOfN?: number;
}
export interface CreatedTask {
    id: string;
}
export type AttemptStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export interface TaskText {
    prompt?: string;
    messages: string[];
    turnId?: string;
    siblingTurnIds: string[];
    attemptPlacement?: number;
    attemptStatus: AttemptStatus;
}
export interface ApplyOptions {
    diffOverride?: string;
    dryRun?: boolean;
}
export type ApplyStatus = 'success' | 'partial' | 'error';
export interface ApplyOutcome {
    applied: boolean;
    status: ApplyStatus;
    message: string;
    skippedPaths: string[];
    conflictPaths: string[];
}
export interface TurnAttempt {
    turnId: string;
    attemptPlacement?: number;
    createdAt?: Date;
    status: AttemptStatus;
    diff?: string;
    messages: string[];
}
export interface ListTasksOptions {
    /**
     * Filter by environment ID.
     *
     * **Note:** Backend filtering is currently unreliable. The server may return
     * tasks from all environments regardless of this parameter. Use task IDs and
     * getTaskText() to track specific tasks instead.
     */
    environmentId?: string;
    /** Max results to return */
    limit?: number;
}
export interface EnvironmentInfo {
    id: string;
    label?: string;
    isPinned?: boolean;
    repoHints?: string;
}
