import { setTimeout as delay } from 'timers/promises';
import type { PartialCodexLogger } from './logger';
import { log } from './logger';

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
}

const DEFAULT_RETRY_POLICY: Required<Omit<RetryPolicy, 'maxRetries'>> = {
  initialDelayMs: 250,
  backoffFactor: 2,
  maxDelayMs: 5000,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy | undefined,
  logger?: PartialCodexLogger,
  label = 'operation',
): Promise<T> {
  const { maxRetries } = policy ?? { maxRetries: 0 };
  const initialDelay = policy?.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs;
  const factor = policy?.backoffFactor ?? DEFAULT_RETRY_POLICY.backoffFactor;
  const maxDelay = policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;

  let attempt = 0;
  let delayMs = initialDelay;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      if (attempt > 0) {
        log(logger, 'debug', `Retrying ${label}`, { attempt });
      }
      return await operation();
    } catch (error) {
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
      delayMs = Math.min(delayMs * factor, maxDelay);
      attempt += 1;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`${label} failed after ${maxRetries + 1} attempts`);
}
