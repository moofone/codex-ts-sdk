export enum CloudTasksErrorCode {
  HTTP = 'HTTP',
  IO = 'IO',
  UNIMPLEMENTED = 'UNIMPLEMENTED',
  MESSAGE = 'MESSAGE',
}

export class CloudTasksError extends Error {
  constructor(message: string, public readonly code: CloudTasksErrorCode) {
    super(message);
    this.name = 'CloudTasksError';
  }
}

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Cloud tasks error';
}

function extractCode(err: unknown, fallback: CloudTasksErrorCode): CloudTasksErrorCode {
  const values = Object.values(CloudTasksErrorCode) as string[];
  if (typeof err === 'object' && err && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string' && values.includes(c)) return c as CloudTasksErrorCode;
  }
  return fallback;
}

export function toCloudTasksError(err: unknown, fallbackCode: CloudTasksErrorCode = CloudTasksErrorCode.IO): CloudTasksError {
  if (err instanceof CloudTasksError) return err;
  const message = extractMessage(err);
  const code = extractCode(err, fallbackCode);
  return new CloudTasksError(message, code);
}
