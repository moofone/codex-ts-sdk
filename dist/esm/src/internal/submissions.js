export function createUserInputSubmission(id, items) {
    return {
        id,
        op: {
            type: 'user_input',
            items,
        },
    };
}
export function createUserTurnSubmission(id, options) {
    const op = {
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
export function createInterruptSubmission(id) {
    return {
        id,
        op: {
            type: 'interrupt',
        },
    };
}
export function createOverrideTurnContextSubmission(id, options) {
    const op = {
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
export function createExecApprovalSubmission(id, options) {
    const decision = options.decision === 'approve' ? 'approved' : 'denied';
    return {
        id,
        op: {
            type: 'exec_approval',
            id: options.id,
            decision,
        },
    };
}
export function createPatchApprovalSubmission(id, options) {
    const decision = options.decision === 'approve' ? 'approved' : 'denied';
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
export function createAddToHistorySubmission(id, options) {
    return {
        id,
        op: {
            type: 'add_to_history',
            text: options.text,
        },
    };
}
export function createGetHistoryEntryRequestSubmission(id, options) {
    return {
        id,
        op: {
            type: 'get_history_entry_request',
            offset: options.offset,
            log_id: options.logId,
        },
    };
}
export function createGetPathSubmission(id) {
    return {
        id,
        op: {
            type: 'get_path',
        },
    };
}
export function createListMcpToolsSubmission(id) {
    return {
        id,
        op: {
            type: 'list_mcp_tools',
        },
    };
}
export function createListCustomPromptsSubmission(id) {
    return {
        id,
        op: {
            type: 'list_custom_prompts',
        },
    };
}
export function createCompactSubmission(id) {
    return {
        id,
        op: {
            type: 'compact',
        },
    };
}
export function createReviewSubmission(id, options) {
    return {
        id,
        op: {
            type: 'review',
            review_request: options.reviewRequest,
        },
    };
}
export function createShutdownSubmission(id) {
    return {
        id,
        op: {
            type: 'shutdown',
        },
    };
}
export function createStatusSubmission(id) {
    return {
        id,
        op: {
            type: 'status',
        },
    };
}
//# sourceMappingURL=submissions.js.map