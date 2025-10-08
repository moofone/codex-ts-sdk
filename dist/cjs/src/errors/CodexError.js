"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexSessionError = exports.CodexConnectionError = exports.CodexAuthError = exports.CodexError = void 0;
class CodexError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        this.details = details;
    }
}
exports.CodexError = CodexError;
class CodexAuthError extends CodexError {
    constructor(message, details) {
        super(message, 'AUTH', details);
    }
}
exports.CodexAuthError = CodexAuthError;
class CodexConnectionError extends CodexError {
    constructor(message, details) {
        super(message, 'CONNECTION', details);
    }
}
exports.CodexConnectionError = CodexConnectionError;
class CodexSessionError extends CodexError {
    constructor(message, details) {
        super(message, 'SESSION', details);
    }
}
exports.CodexSessionError = CodexSessionError;
