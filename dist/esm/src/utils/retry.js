import { setTimeout as delay } from 'timers/promises';
import { log } from './logger';
const DEFAULT_RETRY_POLICY = {
    initialDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5000,
};
export async function withRetry(operation, policy, logger, label = 'operation') {
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
                log(logger, 'debug', `Retrying ${label}`, { attempt });
            }
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
                break;
            }
            log(logger, 'warn', `${label} failed`, {
                attempt,
                maxRetries,
                error: error instanceof Error ? error.message : String(error),
            });
            await delay(delayMs);
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
//# sourceMappingURL=retry.js.map