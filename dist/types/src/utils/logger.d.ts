export type CodexLogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface CodexLogger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
export type PartialCodexLogger = Partial<CodexLogger>;
export declare function resolveLogger(logger?: PartialCodexLogger): CodexLogger;
export declare function log(logger: PartialCodexLogger | undefined, level: CodexLogLevel, message: string, context?: Record<string, unknown>): void;
