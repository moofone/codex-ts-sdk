function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function pick(o, camel, snake) {
    if (!isObject(o))
        return undefined;
    if (camel in o)
        return o[camel];
    if (snake && snake in o)
        return o[snake];
    return undefined;
}
export function toAttemptStatus(value) {
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
export function toTaskSummary(n) {
    const updatedAt = pick(n, 'updatedAt', 'updated_at');
    const createdAt = pick(n, 'createdAt', 'created_at');
    const hasGeneratedTitle = pick(n, 'hasGeneratedTitle', 'has_generated_title');
    const environmentId = pick(n, 'environmentId', 'environment_id');
    const environmentLabel = pick(n, 'environmentLabel', 'environment_label');
    const isReview = pick(n, 'isReview', 'is_review') ?? false;
    const attemptTotal = pick(n, 'attemptTotal', 'attempt_total');
    const hasUnreadTurn = pick(n, 'hasUnreadTurn', 'has_unread_turn');
    const branchName = pick(n, 'branchName', 'branch_name');
    const turnId = pick(n, 'turnId', 'turn_id');
    const turnStatus = pick(n, 'turnStatus', 'turn_status');
    const siblingTurnIds = pick(n, 'siblingTurnIds', 'sibling_turn_ids');
    const initialIntent = pick(n, 'initialIntent', 'initial_intent');
    const fixTaskId = pick(n, 'fixTaskId', 'fix_task_id');
    const filesChanged = pick(n.summary, 'filesChanged', 'files_changed') ?? 0;
    const linesAdded = pick(n.summary, 'linesAdded', 'lines_added') ?? 0;
    const linesRemoved = pick(n.summary, 'linesRemoved', 'lines_removed') ?? 0;
    return {
        id: n.id,
        title: n.title,
        status: n.status,
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
            baseBranch: pick(pr, 'baseBranch', 'base_branch'),
            headBranch: pick(pr, 'headBranch', 'head_branch'),
            baseSha: pick(pr, 'baseSha', 'base_sha'),
            headSha: pick(pr, 'headSha', 'head_sha'),
            mergeCommitSha: pick(pr, 'mergeCommitSha', 'merge_commit_sha'),
        })),
    };
}
export function toApplyOutcome(n) {
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
export function toTurnAttempt(n) {
    const turnId = pick(n, 'turnId', 'turn_id');
    const attemptPlacement = pick(n, 'attemptPlacement', 'attempt_placement');
    const created = pick(n, 'createdAt', 'created_at');
    const messages = pick(n, 'messages') ?? [];
    return {
        turnId,
        attemptPlacement,
        createdAt: created ? new Date(created) : undefined,
        status: toAttemptStatus(n.status),
        diff: n.diff,
        messages,
    };
}
export function toTaskText(n) {
    const messages = pick(n, 'messages') ?? [];
    const turnId = pick(n, 'turnId', 'turn_id');
    const siblingTurnIds = pick(n, 'siblingTurnIds', 'sibling_turn_ids') ?? [];
    const attemptPlacement = pick(n, 'attemptPlacement', 'attempt_placement');
    const attemptStatus = toAttemptStatus(pick(n, 'attemptStatus', 'attempt_status'));
    return {
        prompt: n.prompt,
        messages,
        turnId,
        siblingTurnIds,
        attemptPlacement,
        attemptStatus,
    };
}
//# sourceMappingURL=converters.js.map