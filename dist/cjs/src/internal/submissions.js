"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusSubmission = exports.createShutdownSubmission = exports.createReviewSubmission = exports.createCompactSubmission = exports.createListCustomPromptsSubmission = exports.createListMcpToolsSubmission = exports.createGetPathSubmission = exports.createGetHistoryEntryRequestSubmission = exports.createAddToHistorySubmission = exports.createPatchApprovalSubmission = exports.createExecApprovalSubmission = exports.createOverrideTurnContextSubmission = exports.createInterruptSubmission = exports.createUserTurnSubmission = exports.createUserInputSubmission = void 0;
function createUserInputSubmission(id, items) {
    return {
        id,
        op: {
            type: 'user_input',
            items,
        },
    };
}
exports.createUserInputSubmission = createUserInputSubmission;
function createUserTurnSubmission(id, options) {
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
exports.createUserTurnSubmission = createUserTurnSubmission;
function createInterruptSubmission(id) {
    return {
        id,
        op: {
            type: 'interrupt',
        },
    };
}
exports.createInterruptSubmission = createInterruptSubmission;
function createOverrideTurnContextSubmission(id, options) {
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
exports.createOverrideTurnContextSubmission = createOverrideTurnContextSubmission;
function createExecApprovalSubmission(id, options) {
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
exports.createExecApprovalSubmission = createExecApprovalSubmission;
function createPatchApprovalSubmission(id, options) {
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
exports.createPatchApprovalSubmission = createPatchApprovalSubmission;
function createAddToHistorySubmission(id, options) {
    return {
        id,
        op: {
            type: 'add_to_history',
            text: options.text,
        },
    };
}
exports.createAddToHistorySubmission = createAddToHistorySubmission;
function createGetHistoryEntryRequestSubmission(id, options) {
    return {
        id,
        op: {
            type: 'get_history_entry_request',
            offset: options.offset,
            log_id: options.logId,
        },
    };
}
exports.createGetHistoryEntryRequestSubmission = createGetHistoryEntryRequestSubmission;
function createGetPathSubmission(id) {
    return {
        id,
        op: {
            type: 'get_path',
        },
    };
}
exports.createGetPathSubmission = createGetPathSubmission;
function createListMcpToolsSubmission(id) {
    return {
        id,
        op: {
            type: 'list_mcp_tools',
        },
    };
}
exports.createListMcpToolsSubmission = createListMcpToolsSubmission;
function createListCustomPromptsSubmission(id) {
    return {
        id,
        op: {
            type: 'list_custom_prompts',
        },
    };
}
exports.createListCustomPromptsSubmission = createListCustomPromptsSubmission;
function createCompactSubmission(id) {
    return {
        id,
        op: {
            type: 'compact',
        },
    };
}
exports.createCompactSubmission = createCompactSubmission;
function createReviewSubmission(id, options) {
    return {
        id,
        op: {
            type: 'review',
            review_request: options.reviewRequest,
        },
    };
}
exports.createReviewSubmission = createReviewSubmission;
function createShutdownSubmission(id) {
    return {
        id,
        op: {
            type: 'shutdown',
        },
    };
}
exports.createShutdownSubmission = createShutdownSubmission;
function createStatusSubmission(id) {
    return {
        id,
        op: {
            type: 'status',
        },
    };
}
exports.createStatusSubmission = createStatusSubmission;
