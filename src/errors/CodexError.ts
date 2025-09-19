export class CodexError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class CodexAuthError extends CodexError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTH', details);
  }
}

export class CodexConnectionError extends CodexError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONNECTION', details);
  }
}

export class CodexSessionError extends CodexError {
  constructor(message: string, details?: unknown) {
    super(message, 'SESSION', details);
  }
}
