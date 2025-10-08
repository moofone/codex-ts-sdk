/**
 * Error during resumption operation
 */
export class ResumptionError extends Error {
    code;
    eventIndex;
    recoverable;
    constructor(message, code, eventIndex, recoverable = true) {
        super(message);
        this.name = 'ResumptionError';
        this.code = code;
        this.eventIndex = eventIndex;
        this.recoverable = recoverable;
    }
}
/**
 * Error during validation operation
 */
export class ValidationError extends Error {
    errors;
    constructor(message, errors) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}
/**
 * Error when resumption times out
 */
export class ResumptionTimeoutError extends Error {
    timeoutMs;
    eventsCompleted;
    constructor(timeoutMs, eventsCompleted) {
        super(`Resumption timed out after ${timeoutMs}ms (${eventsCompleted} events completed)`);
        this.name = 'ResumptionTimeoutError';
        this.timeoutMs = timeoutMs;
        this.eventsCompleted = eventsCompleted;
    }
}
/**
 * Events that should be skipped during side-effect-free replay
 */
export const SIDE_EFFECT_EVENT_TYPES = [
    'exec_approval_request',
    'patch_approval_request',
    'file_write',
    'command_execution',
    'shell_command',
    'git_operation',
    'network_request'
];
/**
 * Events that are safe to replay without side effects
 */
export const SAFE_REPLAY_EVENT_TYPES = [
    'session_created',
    'session_configured',
    'turn_started',
    'turn_completed',
    'token_count',
    'notification',
    'task_started',
    'task_complete',
    'response_completed'
];
//# sourceMappingURL=resumption.js.map