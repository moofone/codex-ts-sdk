export type CodexLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface CodexLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export type PartialCodexLogger = Partial<CodexLogger>;

const noop = () => undefined;

const NOOP_LOGGER: CodexLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

export function resolveLogger(logger?: PartialCodexLogger): CodexLogger {
  if (!logger) {
    return NOOP_LOGGER;
  }

  return {
    debug: logger.debug ?? noop,
    info: logger.info ?? noop,
    warn: logger.warn ?? noop,
    error: logger.error ?? noop,
  };
}

export function log(
  logger: PartialCodexLogger | undefined,
  level: CodexLogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const resolved = resolveLogger(logger);
  switch (level) {
    case 'debug':
      resolved.debug(message, context);
      break;
    case 'info':
      resolved.info(message, context);
      break;
    case 'warn':
      resolved.warn(message, context);
      break;
    case 'error':
      resolved.error(message, context);
      break;
    default:
      break;
  }
}
