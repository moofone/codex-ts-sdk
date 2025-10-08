export declare class CodexError extends Error {
    readonly code: string;
    readonly details?: unknown;
    constructor(message: string, code: string, details?: unknown);
}
export declare class CodexAuthError extends CodexError {
    constructor(message: string, details?: unknown);
}
export declare class CodexConnectionError extends CodexError {
    constructor(message: string, details?: unknown);
}
export declare class CodexSessionError extends CodexError {
    constructor(message: string, details?: unknown);
}
