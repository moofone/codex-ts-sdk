"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAFE_REPLAY_EVENT_TYPES = exports.SIDE_EFFECT_EVENT_TYPES = exports.ResumptionTimeoutError = exports.ValidationError = exports.ResumptionError = void 0;
/**
 * Error during resumption operation
 */
class ResumptionError extends Error {
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
exports.ResumptionError = ResumptionError;
/**
 * Error during validation operation
 */
class ValidationError extends Error {
    errors;
    constructor(message, errors) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}
exports.ValidationError = ValidationError;
/**
 * Error when resumption times out
 */
class ResumptionTimeoutError extends Error {
    timeoutMs;
    eventsCompleted;
    constructor(timeoutMs, eventsCompleted) {
        super(`Resumption timed out after ${timeoutMs}ms (${eventsCompleted} events completed)`);
        this.name = 'ResumptionTimeoutError';
        this.timeoutMs = timeoutMs;
        this.eventsCompleted = eventsCompleted;
    }
}
exports.ResumptionTimeoutError = ResumptionTimeoutError;
/**
 * Events that should be skipped during side-effect-free replay
 */
exports.SIDE_EFFECT_EVENT_TYPES = [
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
exports.SAFE_REPLAY_EVENT_TYPES = [
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
