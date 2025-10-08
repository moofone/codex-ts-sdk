export class CodexError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        this.details = details;
    }
}
export class CodexAuthError extends CodexError {
    constructor(message, details) {
        super(message, 'AUTH', details);
    }
}
export class CodexConnectionError extends CodexError {
    constructor(message, details) {
        super(message, 'CONNECTION', details);
    }
}
export class CodexSessionError extends CodexError {
    constructor(message, details) {
        super(message, 'SESSION', details);
    }
}
//# sourceMappingURL=CodexError.js.map