"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = void 0;
const promises_1 = require("timers/promises");
const logger_1 = require("./logger");
const DEFAULT_RETRY_POLICY = {
    initialDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5000,
};
async function withRetry(operation, policy, logger, label = 'operation') {
    const { maxRetries } = policy ?? { maxRetries: 0 };
    const initialDelay = policy?.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs;
    const factor = policy?.backoffFactor ?? DEFAULT_RETRY_POLICY.backoffFactor;
    const maxDelay = policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;
    let attempt = 0;
    let delayMs = initialDelay;
    let lastError;
    while (attempt <= maxRetries) {
        try {
            if (attempt > 0) {
                (0, logger_1.log)(logger, 'debug', `Retrying ${label}`, { attempt });
            }
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
                break;
            }
            (0, logger_1.log)(logger, 'warn', `${label} failed`, {
                attempt,
                maxRetries,
                error: error instanceof Error ? error.message : String(error),
            });
            await (0, promises_1.setTimeout)(delayMs);
            delayMs *= factor;
            if (delayMs > maxDelay) {
                delayMs = maxDelay;
            }
            attempt += 1;
        }
    }
    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error(`${label} failed after ${maxRetries + 1} attempts`);
}
exports.withRetry = withRetry;
